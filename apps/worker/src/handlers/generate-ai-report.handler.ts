import { PrismaClient, JobStatus, EmailStatus, AIReportStatus, UserRole } from '@prisma/client';
import { executeMarginAIWorkflow } from '@prozo/ai';
import {
  calculateOperationalMetrics,
  calculateWorkforceMetrics,
  calculateProductivityMetrics,
  reconcileContractorCosts,
  evaluateDataCompleteness,
  generateInputFingerprint,
  compareMetricToHistorical
} from '@prozo/finance';
import { CalculatedPnL } from '@prozo/shared';

export async function handleGenerateAIReport(
  payload: { submissionId: string; force?: boolean },
  prisma: PrismaClient
) {
  if ((payload as any)?.test) {
    console.log(`[GENERATE_AI_REPORT] Test probe job received. Skipping execution.`);
    return { status: 'SKIPPED_TEST' };
  }

  const { submissionId, force = false } = payload || {};
  console.log(`[GENERATE_AI_REPORT] Starting AI report generation for submissionId=${submissionId} (force=${force})`);

  if (!submissionId) {
    console.error(`[GENERATE_AI_REPORT] Missing submissionId in job payload:`, payload);
    throw new Error(`[GENERATE_AI_REPORT] Invalid payload: 'submissionId' is required and cannot be undefined`);
  }

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

  // 1. Fetch latest Operational and Workforce records
  const [operationsRecord, laborRecord] = await Promise.all([
    prisma.operationalDailyMetrics.findFirst({
      where: { fcId: submission.fcId, businessDate: submission.businessDate, isLatest: true }
    }),
    prisma.workforceDailyMetrics.findFirst({
      where: { fcId: submission.fcId, businessDate: submission.businessDate, isLatest: true }
    })
  ]);

  const completeness = evaluateDataCompleteness({
    fcId: submission.fcId,
    businessDate: dateStr,
    hasPnl: true,
    hasOperations: !!operationsRecord,
    hasLabor: !!laborRecord,
    pnlVersion: submission.version,
    operationsVersion: operationsRecord?.version,
    laborVersion: laborRecord?.version
  });

  console.log(`[GENERATE_AI_REPORT] Evaluated completeness: ${completeness.completeness}, diagnosticStatus: ${completeness.diagnosticStatus} (hasOps=${!!operationsRecord}, hasLabor=${!!laborRecord})`);

  // Require all three files to be present before allowing AI investigation
  const hasPnl = !!submission.pnl;
  const hasOperations = !!operationsRecord;
  const hasLabor = !!laborRecord;

  if (!hasPnl || !hasOperations || !hasLabor) {
    const missing: string[] = [];
    if (!hasPnl) missing.push('Financial P&L');
    if (!hasOperations) missing.push('Daily Operations');
    if (!hasLabor) missing.push('Daily Labor');

    console.warn(`[GENERATE_AI_REPORT] Refusing execution: all 3 files required. Missing: ${missing.join(', ')}`);
    throw new Error(
      `AI investigation cannot be triggered until all three files (Financial P&L, Daily Operations, and Daily Labor) are uploaded. Missing: ${missing.join(', ')}`
    );
  }

  // 2. Compute Deterministic Derived Operational and Workforce Analytics
  const operationalInput = operationsRecord ? {
    fcId: submission.fcId,
    businessDate: dateStr,
    inboundShipments: operationsRecord.inboundShipments,
    outboundOrders: operationsRecord.outboundOrders,
    unitsProcessed: operationsRecord.unitsProcessed,
    orderLinesProcessed: operationsRecord.orderLinesProcessed,
    returnsProcessed: operationsRecord.returnsProcessed,
    operatingHours: Number(operationsRecord.operatingHours),
    storageOccupancyPct: operationsRecord.storageOccupancyPct ? Number(operationsRecord.storageOccupancyPct) : null,
    sourceRowIndex: operationsRecord.sourceRowIndex ?? undefined
  } : null;

  const laborInput = laborRecord ? {
    fcId: submission.fcId,
    businessDate: dateStr,
    plannedHeadcount: laborRecord.plannedHeadcount,
    actualHeadcount: laborRecord.actualHeadcount,
    plannedLabourHours: Number(laborRecord.plannedLabourHours),
    actualPaidHours: Number(laborRecord.actualPaidHours),
    productiveHours: Number(laborRecord.productiveHours),
    overtimeHours: Number(laborRecord.overtimeHours),
    contractorHeadcount: laborRecord.contractorHeadcount,
    contractorHours: Number(laborRecord.contractorHours),
    contractorCost: laborRecord.contractorCost.toString(),
    sourceRowIndex: laborRecord.sourceRowIndex ?? undefined
  } : null;

  const operationalMetrics = calculateOperationalMetrics(operationalInput);
  const workforceMetrics = calculateWorkforceMetrics(laborInput, operationalInput);
  const productivityMetrics = calculateProductivityMetrics(pnl.manpowerCost.toString(), operationalInput, laborInput);
  const contractorReconciliation = reconcileContractorCosts(
    pnl.manpowerCost.toString(),
    laborRecord?.contractorCost ? laborRecord.contractorCost.toString() : null,
    {
      actualPaidHours: laborInput?.actualPaidHours,
      contractorHours: laborInput?.contractorHours
    }
  );

  // 3. Fetch structured historical context (pure SQL/Prisma, no vector DB)
  console.log(`[GENERATE_AI_REPORT] Fetching historical records for FC ${submission.fc.code} (up to 30 days prior)...`);
  const [priorPnls, priorOps, priorLabor] = await Promise.all([
    prisma.dailyPnL.findMany({
      where: {
        submission: {
          fcId: submission.fcId,
          businessDate: { lt: submission.businessDate },
          isLatest: true
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 30
    }),
    prisma.operationalDailyMetrics.findMany({
      where: {
        fcId: submission.fcId,
        businessDate: { lt: submission.businessDate },
        isLatest: true
      },
      orderBy: { businessDate: 'desc' },
      take: 30
    }),
    prisma.workforceDailyMetrics.findMany({
      where: {
        fcId: submission.fcId,
        businessDate: { lt: submission.businessDate },
        isLatest: true
      },
      orderBy: { businessDate: 'desc' },
      take: 30
    })
  ]);

  // Build baseline comparisons
  const historicalComparisons = {
    outboundOrders: compareMetricToHistorical(
      'outboundOrders',
      operationsRecord?.outboundOrders,
      priorOps.map(o => ({ businessDate: o.businessDate.toISOString().split('T')[0]!, value: o.outboundOrders })),
      'orders',
      { targetBusinessDate: dateStr, windowDays: 30 }
    ),
    overtimeRatio: compareMetricToHistorical(
      'overtimeRatio',
      workforceMetrics.overtimeRatio,
      priorLabor.map(l => {
        const paid = Number(l.actualPaidHours);
        const ot = Number(l.overtimeHours);
        return {
          businessDate: l.businessDate.toISOString().split('T')[0]!,
          value: paid > 0 ? (ot / paid) * 100 : null
        };
      }),
      '%',
      { targetBusinessDate: dateStr, windowDays: 30 }
    ),
    labourUtilization: compareMetricToHistorical(
      'labourUtilization',
      workforceMetrics.labourUtilization,
      priorLabor.map(l => {
        const paid = Number(l.actualPaidHours);
        const prod = Number(l.productiveHours);
        return {
          businessDate: l.businessDate.toISOString().split('T')[0]!,
          value: paid > 0 ? (prod / paid) * 100 : null
        };
      }),
      '%',
      { targetBusinessDate: dateStr, windowDays: 30 }
    )
  };

  const historicalContext = {
    priorSubmissionsCount: priorPnls.length,
    recentColours: priorPnls.slice(0, 7).map(p => p.colour),
    historicalAverages: priorPnls.length > 0 ? {
      sampleDays: priorPnls.length,
      averageCM2Pct: (priorPnls.reduce((acc, p) => acc + Number(p.cm2Pct), 0) / priorPnls.length).toFixed(4)
    } : null,
    operationalComparisons: historicalComparisons
  };

  const modelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const promptVersion = 'v3.0.0';
  const inputFingerprint = generateInputFingerprint({
    fcId: submission.fcId,
    businessDate: dateStr,
    pnlVersion: submission.version,
    operationsVersion: operationsRecord?.version,
    laborVersion: laborRecord?.version,
    model: modelName,
    promptVersion
  });

  // Check if a report with the exact same fingerprint already exists
  const existingLatestReport = await prisma.aIReport.findFirst({
    where: { dailyPnlId: pnl.id, isLatest: true },
    orderBy: { version: 'desc' }
  });

  if (existingLatestReport && existingLatestReport.inputFingerprint === inputFingerprint && !force) {
    console.log(`[GENERATE_AI_REPORT] AI report already up-to-date with identical fingerprint (${inputFingerprint}). Skipping duplicate execution.`);
    return {
      submissionId,
      status: 'UP_TO_DATE',
      reportId: existingLatestReport.id,
      investigationSummary: (existingLatestReport.investigation as any)?.summary,
      recommendationsCount: ((existingLatestReport.recommendations as any)?.recommendations || []).length
    };
  }

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
      deviationFromTargetPP: (a as any).deviationFromTargetPP ? (a as any).deviationFromTargetPP.toString() : (a.deviationPP ? a.deviationPP.toString() : null),
      breachBeyondTolerancePP: (a as any).breachBeyondTolerancePP ? (a as any).breachBeyondTolerancePP.toString() : (a.deviationPP ? a.deviationPP.toString() : null),
      impactAmount: a.impactAmount ? a.impactAmount.toString() : null,
      severity: a.severity as any,
      description: a.description
    }))
  };

  const nextVersion = existingLatestReport ? existingLatestReport.version + 1 : 1;
  const previousReportId = existingLatestReport ? existingLatestReport.id : null;

  // 4. Execute LangGraph 2-Agent workflow with enriched operational evidence
  console.log(`[GENERATE_AI_REPORT] Calling executeMarginAIWorkflow for FC=${submission.fc.code}, Date=${dateStr}, Version=${nextVersion}...`);
  const aiResult = await executeMarginAIWorkflow(
    submission.fc.code,
    dateStr,
    submission.id,
    domainPnL,
    historicalContext,
    undefined,
    {
      operationsData: operationalInput,
      laborData: laborInput,
      completeness: completeness.completeness,
      diagnosticStatus: completeness.diagnosticStatus,
      derivedMetrics: {
        operational: operationalMetrics,
        workforce: workforceMetrics,
        productivity: productivityMetrics,
        reconciliation: contractorReconciliation,
        historicalComparisons
      },
      version: nextVersion,
      previousReportId
    }
  );

  console.log(`[GENERATE_AI_REPORT] executeMarginAIWorkflow completed: isFallback=${aiResult.isFallback}, findings=${aiResult.investigation.findings.length}, recommendations=${aiResult.recommendation.recommendations.length}`);

  // 5. Transactionally persist AIReport and update pointer without overwriting previous versions
  const createdReport = await prisma.$transaction(async tx => {
    if (existingLatestReport) {
      await tx.aIReport.updateMany({
        where: { dailyPnlId: pnl.id, isLatest: true },
        data: { isLatest: false }
      });
    }

    const prismaDiagStatus =
      aiResult.investigation.diagnosticStatus === 'VALIDATION_FAILED' || (aiResult.investigation.diagnosticStatus as string) === 'FAILED'
        ? 'INSUFFICIENT_DATA'
        : aiResult.investigation.diagnosticStatus;

    const reportStatus =
      aiResult.investigation.diagnosticStatus === 'VALIDATION_FAILED' || (aiResult.investigation.diagnosticStatus as string) === 'FAILED'
        ? AIReportStatus.FAILED
        : AIReportStatus.COMPLETED;

    const report = await tx.aIReport.create({
      data: {
        dailyPnlId: pnl.id,
        version: nextVersion,
        isLatest: true,
        status: reportStatus,
        diagnosticStatus: prismaDiagStatus as any,
        evidenceCompleteness: completeness.completeness,
        investigation: {
          ...aiResult.investigation,
          tokenUsage: aiResult.tokenUsage,
          investigationContext: aiResult.investigationContext
        } as any,
        recommendations: aiResult.recommendation as any,
        model: modelName,
        promptVersion,
        graphThreadId: `margin:${submission.fc.id}:${dateStr}:${submission.id}:v${nextVersion}`,
        inputFingerprint,
        operationalDataVersion: operationsRecord?.version ?? null,
        workforceDataVersion: laborRecord?.version ?? null,
        financialDataVersion: submission.version,
        targetRulesVersion: 1,
        previousReportId,
        generatedAt: new Date()
      }
    });

    await tx.dailyPnL.update({
      where: { id: pnl.id },
      data: { latestAiReportId: report.id }
    });

    return report;
  });

  console.log(`[GENERATE_AI_REPORT] Persisted AIReport id=${createdReport.id} (version=${nextVersion}, isLatest=true) for dailyPnlId=${pnl.id}`);

  // 6. Schedule Email Digest
  await prisma.$transaction(async tx => {
    const managerAssignments = await tx.userFulfilmentCentre.findMany({
      where: { fcId: submission.fcId, user: { isActive: true } },
      include: { user: true }
    });
    const responsibleManagers = managerAssignments.map(m => m.user);

    const activeAdmins = await tx.user.findMany({
      where: { role: UserRole.ADMIN, isActive: true }
    });

    const recipientsMap = new Map<string, typeof activeAdmins[0]>();
    for (const u of [...responsibleManagers, ...activeAdmins]) {
      recipientsMap.set(u.id, u);
    }
    const recipients = Array.from(recipientsMap.values());

    for (const recipient of recipients) {
      const isManager = recipient.role === UserRole.FC_MANAGER;
      const digestSubject = `[Prozo FC Monitor] Daily Digest - ${submission.fc.name} (${dateStr}) - ${pnl.colour}${nextVersion > 1 ? ` (Revised Analysis v${nextVersion})` : ''}`;

      const recommendationsHtml = aiResult.recommendation.recommendations
        .map(
          r => `
          <div style="margin-bottom: 12px; padding: 12px; border-left: 4px solid #3b82f6; background-color: #f8fafc; border-radius: 4px;">
            <div style="font-weight: bold; color: #1e293b; font-size: 14px;">[${r.priority}] ${r.action}</div>
            <div style="color: #64748b; font-size: 12px; margin-top: 4px;">Responsible: <strong>${r.responsibleTeam}</strong></div>
            <div style="color: #475569; font-size: 13px; margin-top: 4px;">${r.rationale || r.reason}</div>
          </div>
        `
        )
        .join('');

      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
          <div style="background-color: ${pnl.colour === 'RED' ? '#ef4444' : pnl.colour === 'YELLOW' ? '#f59e0b' : pnl.colour === 'BLUE' ? '#3b82f6' : '#10b981'}; padding: 16px; border-radius: 8px 8px 0 0; color: white;">
            <h1 style="margin: 0; font-size: 20px;">FC Performance Digest: ${submission.fc.name}</h1>
            <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9;">Business Date: ${dateStr} | Status: ${pnl.colour}${nextVersion > 1 ? ` | Revised v${nextVersion}` : ''}</p>
          </div>
          <div style="padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
            <p>Hello ${recipient.name},</p>
            <p>Evidence completeness status: <strong>${completeness.completeness}</strong> (${aiResult.investigation.diagnosticStatus}).</p>
            <h3 style="border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Executive Summary</h3>
            <p style="line-height: 1.5; color: #334155;">${aiResult.investigation.summary}</p>
            <h3 style="border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 24px;">Recommended Actions</h3>
            ${recommendationsHtml}
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
              <p>Generated automatically by Prozo Margin Monitor AI. All actions require managerial confirmation.</p>
            </div>
          </div>
        </div>
      `;

      const outboxKey = `outbox-digest:${submission.id}:${recipient.id}:v${nextVersion}`;
      const outbox = await tx.emailOutbox.upsert({
        where: { idempotencyKey: outboxKey },
        update: {},
        create: {
          submissionId: submission.id,
          recipient: recipient.email,
          subject: digestSubject,
          htmlBody: emailHtml,
          textBody: `${digestSubject}\n\nSummary:\n${aiResult.investigation.summary}\n\nEvidence: ${completeness.completeness}`,
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
          priority: isManager ? 1 : 3,
          idempotencyKey: emailJobKey,
          maxAttempts: 3
        }
      });
    }
  });

  return {
    submissionId,
    reportId: createdReport.id,
    version: nextVersion,
    diagnosticStatus: aiResult.investigation.diagnosticStatus,
    evidenceCompleteness: completeness.completeness,
    investigationSummary: aiResult.investigation.summary,
    recommendationsCount: aiResult.recommendation.recommendations.length
  };
}
