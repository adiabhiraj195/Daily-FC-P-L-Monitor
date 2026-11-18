import { PrismaClient, JobStatus, EmailStatus, AIReportStatus } from '@prisma/client';
import { executeMarginAIWorkflow } from '@prozo/ai';
import { CalculatedPnL } from '@prozo/shared';

export async function handleGenerateAIReport(
  payload: { submissionId: string },
  prisma: PrismaClient
) {
  const { submissionId } = payload;
  console.log(`[GENERATE_AI_REPORT] Starting AI report generation for submissionId=${submissionId}`);

  const submission = await prisma.dailySubmission.findUnique({
    where: { id: submissionId },
    include: {
      fc: true,
      pnl: {
        include: {
          costLines: true,
          anomalies: true
        }
      }
    }
  });

  if (!submission || !submission.pnl) {
    console.error(`[GENERATE_AI_REPORT] DailySubmission or DailyPnL not found for submission '${submissionId}'`);
    throw new Error(`DailySubmission or DailyPnL not found for submission '${submissionId}'`);
  }

  const pnl = submission.pnl;
  const dateStr = submission.businessDate.toISOString().split('T')[0]!;
  console.log(`[GENERATE_AI_REPORT] Loaded submission for FC=${submission.fc.code} (${submission.fc.name}), Date=${dateStr}, Colour=${pnl.colour}, AnomaliesCount=${pnl.anomalies.length}`);

  // 1. Fetch structured historical context (pure SQL/Prisma, no vector DB)
  console.log(`[GENERATE_AI_REPORT] Fetching historical PnL records for FC ${submission.fc.code} (up to 30 days prior)...`);
  const priorPnls = await prisma.dailyPnL.findMany({
    where: {
      submission: {
        fcId: submission.fcId,
        businessDate: { lt: submission.businessDate },
        isLatest: true
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 30
  });

  const historicalContext = {
    priorSubmissionsCount: priorPnls.length,
    recentColours: priorPnls.slice(0, 7).map(p => p.colour),
    historicalAverages: priorPnls.length > 0 ? {
      sampleDays: priorPnls.length,
      averageCM2Pct: (priorPnls.reduce((acc, p) => acc + Number(p.cm2Pct), 0) / priorPnls.length).toFixed(4)
    } : null
  };

  console.log(`[GENERATE_AI_REPORT] Historical context built: priorCount=${priorPnls.length}, recentColours=[${historicalContext.recentColours.join(', ')}], avgCM2=${historicalContext.historicalAverages?.averageCM2Pct ?? 'N/A'}%`);

  const domainPnL: CalculatedPnL = {
    revenue: pnl.revenue.toString(),
    currency: pnl.currency,
    manpowerCost: pnl.manpowerCost.toString(),
    packagingCost: pnl.packagingCost.toString(),
    powerFuelCost: pnl.powerFuelCost.toString(),
    fcRent: pnl.fcRent.toString(),
    equipmentRentals: pnl.equipmentRentals.toString(),
    overheads: pnl.overheads.toString(),
    costLines: pnl.costLines.map(c => ({
      lineItem: c.lineItem as any,
      amount: c.amount.toString(),
      percentage: c.percentage.toString(),
      targetMinPct: c.targetMinPct ? c.targetMinPct.toString() : null,
      targetMaxPct: c.targetMaxPct ? c.targetMaxPct.toString() : null,
      status: c.status as any,
      excessAmount: c.excessAmount ? c.excessAmount.toString() : null
    })),
    cm1: pnl.cm1.toString(),
    cm1Pct: pnl.cm1Pct.toString(),
    cm2: pnl.cm2.toString(),
    cm2Pct: pnl.cm2Pct.toString(),
    colour: pnl.colour as any,
    targetSnapshot: pnl.targetSnapshot as any,
    anomalies: pnl.anomalies.map(a => ({
      type: a.type as any,
      metricKey: a.metricKey,
      actualPct: a.actualPct.toString(),
      targetMinPct: a.targetMinPct ? a.targetMinPct.toString() : null,
      targetMaxPct: a.targetMaxPct ? a.targetMaxPct.toString() : null,
      deviationPP: a.deviationPP ? a.deviationPP.toString() : null,
      impactAmount: a.impactAmount ? a.impactAmount.toString() : null,
      severity: a.severity as any,
      description: a.description
    }))
  };

  // 2. Execute LangGraph 2-Agent workflow
  console.log(`[GENERATE_AI_REPORT] Calling executeMarginAIWorkflow for FC=${submission.fc.code}, Date=${dateStr}...`);
  const aiResult = await executeMarginAIWorkflow(
    submission.fc.code,
    dateStr,
    submission.id,
    domainPnL,
    historicalContext
  );
  console.log(`[GENERATE_AI_REPORT] executeMarginAIWorkflow completed: isFallback=${aiResult.isFallback}, findings=${aiResult.investigation.findings.length}, recommendations=${aiResult.recommendation.recommendations.length}`);

  // 3. Persist AIReport and schedule Email Digest
  await prisma.$transaction(async tx => {
    await tx.aIReport.upsert({
      where: { dailyPnlId: pnl.id },
      update: {
        status: AIReportStatus.COMPLETED,
        investigation: aiResult.investigation as any,
        recommendations: aiResult.recommendation as any,
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        promptVersion: 'v1.0.0',
        graphThreadId: `margin:${submission.fc.id}:${dateStr}:${submission.id}`,
        generatedAt: new Date()
      },
      create: {
        dailyPnlId: pnl.id,
        status: AIReportStatus.COMPLETED,
        investigation: aiResult.investigation as any,
        recommendations: aiResult.recommendation as any,
        model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
        promptVersion: 'v1.0.0',
        graphThreadId: `margin:${submission.fc.id}:${dateStr}:${submission.id}`,
        generatedAt: new Date()
      }
    });

    console.log(`[GENERATE_AI_REPORT] Persisted AIReport to DB for dailyPnlId=${pnl.id}`);

    // Schedule Email Digest with AI findings
    const managerAssignment = await tx.userFulfilmentCentre.findFirst({
      where: { fcId: submission.fcId },
      include: { user: true }
    });

    const recipient = managerAssignment?.user.email || 'finance@prozo.com';
    const outboxKey = `outbox:${submission.id}:ai-v1`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #0f172a;">Prozo FC Margin Monitor Digest</h2>
        <p><strong>FC:</strong> ${submission.fc.name} (${submission.fc.code})<br>
        <strong>Business Date:</strong> ${dateStr}<br>
        <strong>Status:</strong> <span style="font-weight: bold; color: ${pnl.colour === 'RED' ? '#dc2626' : pnl.colour === 'YELLOW' ? '#d97706' : pnl.colour === 'BLUE' ? '#2563eb' : '#16a34a'};">${pnl.colour}</span></p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
        
        <h3>Financial Summary</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 6px 0;">Revenue:</td><td style="text-align: right; font-weight: bold;">INR ${pnl.revenue.toString()}</td></tr>
          <tr><td style="padding: 6px 0;">CM1:</td><td style="text-align: right; font-weight: bold;">INR ${pnl.cm1.toString()} (${Number(pnl.cm1Pct).toFixed(2)}%)</td></tr>
          <tr><td style="padding: 6px 0;">CM2:</td><td style="text-align: right; font-weight: bold;">INR ${pnl.cm2.toString()} (${Number(pnl.cm2Pct).toFixed(2)}%)</td></tr>
        </table>

        <h3>AI Investigation Summary</h3>
        <p style="background: #f8fafc; padding: 12px; border-left: 4px solid #3b82f6; font-size: 14px;">${aiResult.investigation.summary}</p>

        <h3>Recommended Corrective Actions</h3>
        <ul>
          ${aiResult.recommendation.recommendations.map(r => `<li><strong>[${r.responsibleTeam}]</strong> ${r.action} <em>(Priority: ${r.priority})</em></li>`).join('')}
        </ul>
      </div>
    `;

    const textBody = `Prozo FC Margin Monitor Digest
FC: ${submission.fc.name} (${submission.fc.code})
Date: ${dateStr}
Status: ${pnl.colour}
Revenue: INR ${pnl.revenue.toString()}
CM1: INR ${pnl.cm1.toString()} (${Number(pnl.cm1Pct).toFixed(2)}%)
CM2: INR ${pnl.cm2.toString()} (${Number(pnl.cm2Pct).toFixed(2)}%)

AI Investigation:
${aiResult.investigation.summary}

Recommendations:
${aiResult.recommendation.recommendations.map(r => `- [${r.responsibleTeam}] ${r.action} (Priority: ${r.priority})`).join('\n')}
`;

    const outbox = await tx.emailOutbox.upsert({
      where: { idempotencyKey: outboxKey },
      update: {},
      create: {
        submissionId: submission.id,
        recipient,
        subject: `[Prozo FC Monitor] Daily Digest - ${submission.fc.name} (${dateStr}) - ${pnl.colour}`,
        htmlBody,
        textBody,
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

    console.log(`[GENERATE_AI_REPORT] Created EmailOutbox record (${outbox.id}) and queued SEND_FC_DIGEST job (${emailJobKey}) to recipient=${recipient}`);
  });

  return {
    submissionId,
    investigationSummary: aiResult.investigation.summary,
    recommendationsCount: aiResult.recommendation.recommendations.length,
    isFallback: aiResult.isFallback
  };
}
