import { PrismaClient, SubmissionStatus, JobStatus, EmailStatus, AnomalyType, UserRole, Severity } from '@prisma/client';
import { calculateDailyPnL, resolveTargetSnapshot } from '@prozo/finance';
import { requiresAIInvestigation } from '@prozo/ai';
import { NormalizedFCRecord } from '@prozo/shared';

export async function handleAnalyzeSubmission(
  payload: { submissionId: string },
  prisma: PrismaClient
) {
  if ((payload as any)?.test) {
    console.log(`[ANALYZE_SUBMISSION] Test probe job received. Skipping execution.`);
    return { submissionId: 'test', status: 'SKIPPED_TEST' };
  }

  const { submissionId } = payload || {};
  console.log(`[ANALYZE_SUBMISSION] Starting financial analysis for submissionId=${submissionId}`);

  if (!submissionId) {
    console.error(`[ANALYZE_SUBMISSION] Missing submissionId in job payload:`, payload);
    throw new Error(`[ANALYZE_SUBMISSION] Invalid payload: 'submissionId' is required and cannot be undefined`);
  }

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

    // Handle Anomaly Notifications & Emails if any anomaly was detected
    if (calculated.anomalies.length > 0) {
      console.log(`[ANALYZE_SUBMISSION] Anomalies detected (${calculated.anomalies.length}). Finding responsible managers and admins to notify and email...`);

      // 1. Fetch responsible managers assigned to this FC
      const managerAssignments = await tx.userFulfilmentCentre.findMany({
        where: { fcId: submission.fcId, user: { isActive: true } },
        include: { user: true }
      });
      const responsibleManagers = managerAssignments.map(m => m.user);

      // 2. Fetch active administrators
      const activeAdmins = await tx.user.findMany({
        where: { role: UserRole.ADMIN, isActive: true }
      });

      // Combine and deduplicate users
      const alertUsersMap = new Map<string, typeof activeAdmins[0]>();
      for (const u of [...responsibleManagers, ...activeAdmins]) {
        alertUsersMap.set(u.id, u);
      }
      const uniqueAlertUsers = Array.from(alertUsersMap.values());

      const maxSeverity: Severity = calculated.anomalies.some(a => a.severity === 'CRITICAL')
        ? 'CRITICAL'
        : calculated.anomalies.some(a => a.severity === 'HIGH')
        ? 'HIGH'
        : 'MEDIUM';

      // 3. Create In-App Notifications for all responsible managers and admins
      for (const user of uniqueAlertUsers) {
        await tx.notification.create({
          data: {
            userId: user.id,
            title: `🚨 Anomaly Detected: ${submission.fc.name} (${submission.fc.code})`,
            message: `${calculated.anomalies.length} anomaly(s) found on ${dateStr}. Status: ${calculated.colour}. CM2: ${calculated.cm2Pct}%. Breaches: ${calculated.anomalies.map(a => `${a.metricKey} (${a.type})`).join(', ')}.`,
            type: 'ANOMALY_DETECTED',
            severity: maxSeverity,
            entityType: 'SUBMISSION',
            entityId: submission.id,
            metadata: {
              fcId: submission.fcId,
              fcCode: submission.fc.code,
              fcName: submission.fc.name,
              businessDate: dateStr,
              colour: calculated.colour,
              cm1Pct: calculated.cm1Pct,
              cm2Pct: calculated.cm2Pct,
              anomalies: calculated.anomalies as any
            } as any
          }
        });
      }
      console.log(`[ANALYZE_SUBMISSION] Created ${uniqueAlertUsers.length} in-app notifications for managers and admins`);

      // 4. Create Anomaly Alert Emails in outbox for responsible managers and admins
      const anomalyEmailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background: ${calculated.colour === 'RED' ? '#ef4444' : calculated.colour === 'YELLOW' ? '#f59e0b' : '#3b82f6'}; padding: 20px; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px;">🚨 Operational Anomaly Alert: ${submission.fc.name}</h2>
            <p style="margin: 6px 0 0; opacity: 0.9; font-size: 13px;">Fulfilment Centre Code: ${submission.fc.code} | Business Date: ${dateStr}</p>
          </div>
          <div style="padding: 24px;">
            <p style="margin-top: 0; font-size: 14px; line-height: 1.5;">
              The automated daily financial audit has detected <strong>${calculated.anomalies.length} anomaly/anomalies</strong> for <strong>${submission.fc.name}</strong> on business date <strong>${dateStr}</strong>.
            </p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 20px;">
              <table style="width: 100%; font-size: 13px;">
                <tr><td style="color: #64748b; padding: 4px 0;">FC Status:</td><td style="font-weight: bold; color: ${calculated.colour === 'RED' ? '#dc2626' : calculated.colour === 'YELLOW' ? '#d97706' : '#2563eb'};">${calculated.colour}</td></tr>
                <tr><td style="color: #64748b; padding: 4px 0;">Daily Revenue:</td><td style="font-weight: bold;">INR ${calculated.revenue}</td></tr>
                <tr><td style="color: #64748b; padding: 4px 0;">Contribution Margin 1 (CM1):</td><td style="font-weight: bold;">INR ${calculated.cm1} (${calculated.cm1Pct}%)</td></tr>
                <tr><td style="color: #64748b; padding: 4px 0;">Contribution Margin 2 (CM2):</td><td style="font-weight: bold;">INR ${calculated.cm2} (${calculated.cm2Pct}%)</td></tr>
              </table>
            </div>

            <h3 style="font-size: 15px; margin-bottom: 10px; color: #0f172a;">Detected Anomalies:</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
              <thead>
                <tr style="background: #f1f5f9; text-align: left;">
                  <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Metric</th>
                  <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Type</th>
                  <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Actual</th>
                  <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Target Range</th>
                  <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Severity</th>
                </tr>
              </thead>
              <tbody>
                ${calculated.anomalies.map(a => `
                  <tr style="border-bottom: 1px solid #e2e8f0;">
                    <td style="padding: 8px 10px; font-weight: 600;">${a.metricKey}</td>
                    <td style="padding: 8px 10px;">${a.type}</td>
                    <td style="padding: 8px 10px; font-weight: bold; color: #dc2626;">${a.actualPct}%</td>
                    <td style="padding: 8px 10px; color: #64748b;">${a.targetMinPct ?? 'N/A'}% - ${a.targetMaxPct ?? 'N/A'}%</td>
                    <td style="padding: 8px 10px;"><span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; background: #fee2e2; color: #991b1b;">${a.severity}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div style="background: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; font-size: 13px; margin-bottom: 20px;">
              <strong>Descriptions:</strong>
              <ul style="margin: 6px 0 0 16px; padding: 0;">
                ${calculated.anomalies.map(a => `<li>${a.description}</li>`).join('')}
              </ul>
            </div>

            <p style="font-size: 12px; color: #64748b; margin-top: 24px;">
              This notification was automatically dispatched to the responsible FC Manager and System Administrators according to Prozo Margin Monitor RBAC rules.
            </p>
          </div>
        </div>
      `;

      const anomalyEmailText = `Prozo FC Margin Monitor - Anomaly Alert
FC: ${submission.fc.name} (${submission.fc.code})
Business Date: ${dateStr}
Status: ${calculated.colour}
Revenue: INR ${calculated.revenue}
CM1: INR ${calculated.cm1} (${calculated.cm1Pct}%)
CM2: INR ${calculated.cm2} (${calculated.cm2Pct}%)

Detected Anomalies:
${calculated.anomalies.map(a => `- [${a.severity}] ${a.metricKey} (${a.type}): Actual ${a.actualPct}% (Target: ${a.targetMinPct ?? 'N/A'}% - ${a.targetMaxPct ?? 'N/A'}%). ${a.description}`).join('\n')}
`;

      for (const user of uniqueAlertUsers) {
        const outboxKey = `outbox-anomaly:${submission.id}:${user.id}:v1`;
        const outbox = await tx.emailOutbox.upsert({
          where: { idempotencyKey: outboxKey },
          update: {},
          create: {
            submissionId: submission.id,
            recipient: user.email,
            subject: `[ANOMALY ALERT] ${submission.fc.name} (${submission.fc.code}) - ${calculated.anomalies.length} Anomaly(s) Detected (${dateStr}) - ${calculated.colour}`,
            htmlBody: anomalyEmailHtml,
            textBody: anomalyEmailText,
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
            priority: 2, // High priority for anomaly alerts
            idempotencyKey: emailJobKey,
            maxAttempts: 3
          }
        });
      }
      console.log(`[ANALYZE_SUBMISSION] Queued anomaly alert emails for ${uniqueAlertUsers.length} managers and admins`);
    }

    // Check if AI investigation is required (anomalies or BLUE status)
    const needsAI = requiresAIInvestigation(calculated);
    console.log(`[ANALYZE_SUBMISSION] Evaluation requiresAIInvestigation -> ${needsAI} (Colour=${calculated.colour}, Anomalies=${calculated.anomalies.length})`);

    // Only allow AI investigation once all three files (P&L, Operations, Labor) are uploaded
    const [operationsRecord, laborRecord] = await Promise.all([
      tx.operationalDailyMetrics.findFirst({
        where: { fcId: submission.fcId, businessDate: submission.businessDate, isLatest: true }
      }),
      tx.workforceDailyMetrics.findFirst({
        where: { fcId: submission.fcId, businessDate: submission.businessDate, isLatest: true }
      })
    ]);

    const hasAllThreeFiles = !!operationsRecord && !!laborRecord;

    if (needsAI) {
      if (hasAllThreeFiles) {
        console.log(`[ANALYZE_SUBMISSION] All 3 files uploaded for FC=${submission.fc.code}. Ready for AI investigation via UI trigger button.`);
      } else {
        console.log(`[ANALYZE_SUBMISSION] AI investigation held: awaiting remaining files (hasOps=${!!operationsRecord}, hasLabor=${!!laborRecord})`);
      }
    } else {
      // Normal/Healthy Green FC with 0 anomalies: no AI needed. Schedule standard email digest
      // Normal/Healthy Green FC with 0 anomalies: no AI needed. Schedule standard email digest
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
