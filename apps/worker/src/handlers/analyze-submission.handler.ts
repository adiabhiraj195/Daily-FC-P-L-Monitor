import { PrismaClient, SubmissionStatus, JobStatus, EmailStatus, AnomalyType } from '@prisma/client';
import { calculateDailyPnL, resolveTargetSnapshot } from '@prozo/finance';
import { requiresAIInvestigation } from '@prozo/ai';
import { NormalizedFCRecord } from '@prozo/shared';

export async function handleAnalyzeSubmission(
  payload: { submissionId: string },
  prisma: PrismaClient
) {
  const { submissionId } = payload;
  console.log(`[ANALYZE_SUBMISSION] Starting financial analysis for submissionId=${submissionId}`);

  const submission = await prisma.dailySubmission.findUnique({
    where: { id: submissionId },
    include: { fc: true }
  });

  if (!submission) {
    console.error(`[ANALYZE_SUBMISSION] DailySubmission '${submissionId}' not found in database`);
    throw new Error(`DailySubmission '${submissionId}' not found`);
  }

  if (submission.status === SubmissionStatus.MISSING) {
    console.log(`[ANALYZE_SUBMISSION] Submission ${submissionId} is marked MISSING. Skipping P&L calculation.`);
    return { submissionId, status: 'SKIPPED_MISSING' };
  }

  const rawInput = submission.normalizedInput as unknown as NormalizedFCRecord;
  if (!rawInput) {
    console.error(`[ANALYZE_SUBMISSION] DailySubmission '${submissionId}' has no normalized input data`);
    throw new Error(`DailySubmission '${submissionId}' has no normalized input data`);
  }

  const dateStr = submission.businessDate.toISOString().split('T')[0]!;
  console.log(`[ANALYZE_SUBMISSION] Loaded submission for FC=${submission.fc.code} (${submission.fc.name}), Date=${dateStr}, version=${submission.version}`);

  // 1. Fetch active target rules
  const dbRules = await prisma.targetRule.findMany({
    where: {
      OR: [{ fcId: submission.fcId }, { fcId: null }]
    }
  });

  console.log(`[ANALYZE_SUBMISSION] Fetched ${dbRules.length} target rules applicable to FC ${submission.fc.code}. Resolving target snapshot...`);

  const targetRulesEntities = dbRules.map(r => ({
    id: r.id,
    fcId: r.fcId,
    metricKey: r.metricKey,
    minPct: r.minPct.toString(),
    maxPct: r.maxPct.toString(),
    effectiveFrom: r.effectiveFrom.toISOString().split('T')[0]!,
    effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString().split('T')[0]! : null
  }));

  const targetSnapshot = resolveTargetSnapshot(submission.fcId, dateStr, targetRulesEntities, true);

  // 2. Deterministic Financial Calculations
  console.log(`[ANALYZE_SUBMISSION] Calculating deterministic Daily PnL for FC=${submission.fc.code}...`);
  const calculated = calculateDailyPnL(rawInput, targetSnapshot);
  console.log(`[ANALYZE_SUBMISSION] Calculation completed: Revenue=${calculated.revenue}, CM1=${calculated.cm1} (${calculated.cm1Pct}%), CM2=${calculated.cm2} (${calculated.cm2Pct}%), Colour=${calculated.colour}, AnomaliesCount=${calculated.anomalies.length}`);

  // 3. Transactionally persist PnL, Cost Lines, Anomalies, and schedule dependent work
  await prisma.$transaction(async tx => {
    // Delete prior PnL if reprocessing
    await tx.dailyPnL.deleteMany({
      where: { submissionId: submission.id }
    });

    const pnl = await tx.dailyPnL.create({
      data: {
        submissionId: submission.id,
        revenue: calculated.revenue,
        currency: calculated.currency,
        manpowerCost: calculated.manpowerCost,
        packagingCost: calculated.packagingCost,
        powerFuelCost: calculated.powerFuelCost,
        fcRent: calculated.fcRent,
        equipmentRentals: calculated.equipmentRentals,
        overheads: calculated.overheads,
        cm1: calculated.cm1,
        cm1Pct: calculated.cm1Pct,
        cm2: calculated.cm2,
        cm2Pct: calculated.cm2Pct,
        colour: calculated.colour,
        targetSnapshot: calculated.targetSnapshot as any,
        calculationVersion: 1
      }
    });

    // Create CostLineItems
    for (const costLine of calculated.costLines) {
      await tx.costLineItem.create({
        data: {
          dailyPnlId: pnl.id,
          lineItem: costLine.lineItem as any,
          amount: costLine.amount,
          percentage: costLine.percentage,
          targetMinPct: costLine.targetMinPct,
          targetMaxPct: costLine.targetMaxPct,
          status: costLine.status as any,
          excessAmount: costLine.excessAmount
        }
      });
    }

    // Create Anomalies
    for (const anomaly of calculated.anomalies) {
      await tx.anomaly.create({
        data: {
          dailyPnlId: pnl.id,
          type: anomaly.type as AnomalyType,
          metricKey: anomaly.metricKey,
          actualPct: anomaly.actualPct,
          targetMinPct: anomaly.targetMinPct,
          targetMaxPct: anomaly.targetMaxPct,
          deviationPP: anomaly.deviationPP,
          impactAmount: anomaly.impactAmount,
          severity: anomaly.severity,
          description: anomaly.description
        }
      });
    }

    // Update submission status to COMPLETED
    await tx.dailySubmission.update({
      where: { id: submission.id },
      data: { status: SubmissionStatus.COMPLETED }
    });

    console.log(`[ANALYZE_SUBMISSION] Persisted DailyPnL id=${pnl.id}, ${calculated.costLines.length} cost lines, ${calculated.anomalies.length} anomalies to DB`);

    // Check if AI investigation is required (anomalies or BLUE status)
    const needsAI = requiresAIInvestigation(calculated);
    console.log(`[ANALYZE_SUBMISSION] Evaluation requiresAIInvestigation -> ${needsAI} (Colour=${calculated.colour}, Anomalies=${calculated.anomalies.length})`);

    if (needsAI) {
      const aiJobKey = `generate-ai:${submission.id}:1`;
      await tx.backgroundJob.upsert({
        where: { idempotencyKey: aiJobKey },
        update: {},
        create: {
          jobType: 'GENERATE_AI_REPORT',
          payload: { submissionId: submission.id },
          status: JobStatus.PENDING,
          priority: 5,
          idempotencyKey: aiJobKey,
          maxAttempts: 2
        }
      });
      console.log(`[ANALYZE_SUBMISSION] Queued GENERATE_AI_REPORT job (${aiJobKey}) for submission ${submission.id}`);
    } else {
      // Normal/Healthy Green FC: no AI needed. Schedule email digest directly
      const managerAssignment = await tx.userFulfilmentCentre.findFirst({
        where: { fcId: submission.fcId },
        include: { user: true }
      });

      const recipient = managerAssignment?.user.email || 'finance@prozo.com';
      const outboxKey = `outbox:${submission.id}:1`;

      const outbox = await tx.emailOutbox.upsert({
        where: { idempotencyKey: outboxKey },
        update: {},
        create: {
          submissionId: submission.id,
          recipient,
          subject: `[Prozo FC Monitor] Daily Digest - ${submission.fc.name} (${dateStr}) - GREEN`,
          htmlBody: `<p>FC ${submission.fc.name} reported normal operations on ${dateStr}. CM2: ${calculated.cm2Pct}%.</p>`,
          textBody: `FC ${submission.fc.name} reported normal operations on ${dateStr}. CM2: ${calculated.cm2Pct}%.`,
          status: EmailStatus.PENDING,
          idempotencyKey: outboxKey
        }
      });

      const emailJobKey = `send-digest:${outbox.id}`;
      await tx.backgroundJob.upsert({
        where: { idempotencyKey: emailJobKey },
        update: {},
        create: {
          jobType: 'SEND_FC_DIGEST',
          payload: { emailOutboxId: outbox.id },
          status: JobStatus.PENDING,
          priority: 3,
          idempotencyKey: emailJobKey,
          maxAttempts: 3
        }
      });
      console.log(`[ANALYZE_SUBMISSION] Healthy submission (no AI needed). Queued SEND_FC_DIGEST job (${emailJobKey}) directly`);
    }
  });

  return {
    submissionId,
    colour: calculated.colour,
    cm1Pct: calculated.cm1Pct,
    cm2Pct: calculated.cm2Pct,
    anomaliesCount: calculated.anomalies.length
  };
}
