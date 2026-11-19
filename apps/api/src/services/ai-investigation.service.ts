import { PrismaClient, UserRole, AIReportStatus } from '@prisma/client';
import { executeMarginAIWorkflow, buildInvestigationContext, INVESTIGATION_SYSTEM_PROMPT } from '@prozo/ai';
import {
  calculateOperationalMetrics,
  calculateWorkforceMetrics,
  calculateProductivityMetrics,
  reconcileContractorCosts,
  evaluateDataCompleteness,
  compareMetricToHistorical,
  generateInputFingerprint
} from '@prozo/finance';
import { CalculatedPnL } from '@prozo/shared';

export interface AIReadinessInfo {
  canTrigger: boolean;
  hasAllThreeFiles: boolean;
  completeness: string;
  diagnosticStatus: string;
  files: {
    pnl: { uploaded: boolean; version: number | null; name: string };
    operations: { uploaded: boolean; version: number | null; name: string };
    labor: { uploaded: boolean; version: number | null; name: string };
  };
  missingFiles: string[];
}

export interface PreparedAIInput {
  aiReadiness: AIReadinessInfo;
  inputPayload: Record<string, any>;
  promptPreview: {
    systemPrompt: string;
    userPrompt: string;
    model: string;
  };
}

/**
 * Builds the exact input payload and prompt preview for an anomaly or submission,
 * checking data completeness across Financial P&L, Daily Operations, and Daily Labor.
 */
export async function getPreparedAIInputForAnomaly(
  prisma: PrismaClient,
  anomalyId: string
): Promise<PreparedAIInput> {
  const anomaly = await prisma.anomaly.findUnique({
    where: { id: anomalyId },
    include: {
      dailyPnl: {
        include: {
          submission: { include: { fc: true } },
          costLines: true,
          anomalies: true
        }
      }
    }
  });

  if (!anomaly) {
    throw new Error(`Anomaly '${anomalyId}' not found`);
  }

  const pnl = anomaly.dailyPnl;
  const submission = pnl.submission;
  const fc = submission.fc;
  const dateStr = submission.businessDate.toISOString().split('T')[0]!;

  // 1. Fetch latest Operations and Labor data
  const [operations, labor, priorOps, priorLabor, priorPnls] = await Promise.all([
    prisma.operationalDailyMetrics.findFirst({
      where: { fcId: fc.id, businessDate: submission.businessDate, isLatest: true }
    }),
    prisma.workforceDailyMetrics.findFirst({
      where: { fcId: fc.id, businessDate: submission.businessDate, isLatest: true }
    }),
    prisma.operationalDailyMetrics.findMany({
      where: { fcId: fc.id, businessDate: { lt: submission.businessDate }, isLatest: true },
      orderBy: { businessDate: 'desc' },
      take: 30
    }),
    prisma.workforceDailyMetrics.findMany({
      where: { fcId: fc.id, businessDate: { lt: submission.businessDate }, isLatest: true },
      orderBy: { businessDate: 'desc' },
      take: 30
    }),
    prisma.dailyPnL.findMany({
      where: {
        submission: {
          fcId: fc.id,
          businessDate: { lt: submission.businessDate },
          isLatest: true
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 30
    })
  ]);

  const hasPnl = !!pnl;
  const hasOperations = !!operations;
  const hasLabor = !!labor;
  const hasAllThreeFiles = hasPnl && hasOperations && hasLabor;

  const completeness = evaluateDataCompleteness({
    fcId: fc.id,
    businessDate: dateStr,
    hasPnl,
    hasOperations,
    hasLabor,
    pnlVersion: submission.version,
    operationsVersion: operations?.version,
    laborVersion: labor?.version
  });

  const missingFiles: string[] = [];
  if (!hasPnl) missingFiles.push('Financial P&L');
  if (!hasOperations) missingFiles.push('Daily Operations');
  if (!hasLabor) missingFiles.push('Daily Labor');

  const aiReadiness: AIReadinessInfo = {
    canTrigger: hasAllThreeFiles,
    hasAllThreeFiles,
    completeness: completeness.completeness,
    diagnosticStatus: completeness.diagnosticStatus,
    files: {
      pnl: {
        uploaded: hasPnl,
        version: submission.version,
        name: 'Financial P&L'
      },
      operations: {
        uploaded: hasOperations,
        version: operations?.version ?? null,
        name: 'Daily Operations'
      },
      labor: {
        uploaded: hasLabor,
        version: labor?.version ?? null,
        name: 'Daily Labor'
      }
    },
    missingFiles
  };

  // Structured operational and labor inputs
  const opsInput = operations
    ? {
        fcId: fc.code,
        businessDate: dateStr,
        inboundShipments: operations.inboundShipments,
        outboundOrders: operations.outboundOrders,
        unitsProcessed: operations.unitsProcessed,
        orderLinesProcessed: operations.orderLinesProcessed,
        returnsProcessed: operations.returnsProcessed,
        operatingHours: Number(operations.operatingHours),
        storageOccupancyPct: operations.storageOccupancyPct
          ? Number(operations.storageOccupancyPct)
          : null
      }
    : null;

  const laborInput = labor
    ? {
        fcId: fc.code,
        businessDate: dateStr,
        plannedHeadcount: labor.plannedHeadcount,
        actualHeadcount: labor.actualHeadcount,
        plannedLabourHours: Number(labor.plannedLabourHours),
        actualPaidHours: Number(labor.actualPaidHours),
        productiveHours: Number(labor.productiveHours),
        overtimeHours: Number(labor.overtimeHours),
        contractorHeadcount: labor.contractorHeadcount,
        contractorHours: Number(labor.contractorHours),
        contractorCost: labor.contractorCost.toString()
      }
    : null;

  const derivedOps = calculateOperationalMetrics(opsInput);
  const derivedLabor = calculateWorkforceMetrics(laborInput, opsInput);
  const derivedProd = calculateProductivityMetrics(
    pnl.manpowerCost.toString(),
    opsInput,
    laborInput
  );
  const reconciliation = reconcileContractorCosts(
    pnl.manpowerCost.toString(),
    labor?.contractorCost ? labor.contractorCost.toString() : null,
    {
      actualPaidHours: laborInput?.actualPaidHours,
      contractorHours: laborInput?.contractorHours
    }
  );

  const historicalComparisons = {
    outboundOrders: compareMetricToHistorical(
      'outboundOrders',
      operations?.outboundOrders,
      priorOps.map(o => ({
        businessDate: o.businessDate.toISOString().split('T')[0]!,
        value: o.outboundOrders
      })),
      'orders',
      { targetBusinessDate: dateStr, windowDays: 30 }
    ),
    overtimeRatio: compareMetricToHistorical(
      'overtimeRatio',
      derivedLabor.overtimeRatio,
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
      derivedLabor.labourUtilization,
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
    historicalAverages:
      priorPnls.length > 0
        ? {
            sampleDays: priorPnls.length,
            averageCM2Pct: (
              priorPnls.reduce((acc, p) => acc + Number(p.cm2Pct), 0) / priorPnls.length
            ).toFixed(4)
          }
        : null,
    operationalComparisons: historicalComparisons
  };

  const { compactPayload } = buildInvestigationContext({
    fcId: fc.code,
    businessDate: dateStr,
    pnl: {
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
    },
    operationsData: opsInput as any,
    laborData: laborInput as any,
    derivedMetrics: {
      operational: derivedOps,
      workforce: derivedLabor,
      productivity: derivedProd,
      reconciliation
    },
    historicalContext,
    completeness: completeness.completeness,
    diagnosticStatus: completeness.diagnosticStatus
  });

  const inputPayload = {
    ...compactPayload,
    // Aliases for frontend inspector compatibility
    financialFacts: {
      revenue: pnl.revenue.toString(),
      currency: pnl.currency,
      cm1: pnl.cm1.toString(),
      cm1Pct: pnl.cm1Pct.toString(),
      cm2: pnl.cm2.toString(),
      cm2Pct: pnl.cm2Pct.toString(),
      colour: pnl.colour,
      manpowerCost: pnl.manpowerCost.toString(),
      packagingCost: pnl.packagingCost.toString(),
      powerFuelCost: pnl.powerFuelCost.toString(),
      fcRent: pnl.fcRent.toString(),
      equipmentRentals: pnl.equipmentRentals.toString(),
      overheads: pnl.overheads.toString(),
      costLines: compactPayload.financial.costs,
      costContributors: compactPayload.financial.costs.filter((c: any) => c.status === 'ABOVE_MAX')
    },
    operationsData: opsInput,
    laborData: laborInput,
    derivedMetrics: {
      operational: derivedOps,
      workforce: derivedLabor,
      productivity: derivedProd,
      reconciliation
    },
    historicalContext
  };

  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const systemPrompt = INVESTIGATION_SYSTEM_PROMPT;
  const userPrompt = `Please investigate this submission using available financial, operational, and workforce evidence:\n${JSON.stringify(
    compactPayload,
    null,
    2
  )}`;

  return {
    aiReadiness,
    inputPayload,
    promptPreview: {
      systemPrompt,
      userPrompt,
      model
    }
  };
}

/**
 * Triggers the AI investigation for an anomaly, enforcing that all 3 files
 * (Financial P&L, Daily Operations, Daily Labor) are uploaded before allowing execution.
 */
export async function triggerAIInvestigationForAnomaly(
  prisma: PrismaClient,
  anomalyId: string,
  _userId?: string,
  userRole?: UserRole,
  assignedFcIds?: string[]
) {
  const anomaly = await prisma.anomaly.findUnique({
    where: { id: anomalyId },
    include: {
      dailyPnl: {
        include: {
          submission: { include: { fc: true } },
          costLines: true,
          anomalies: true
        }
      }
    }
  });

  if (!anomaly) {
    throw new Error(`Anomaly '${anomalyId}' not found`);
  }

  const pnl = anomaly.dailyPnl;
  const submission = pnl.submission;
  const fc = submission.fc;

  // Enforce FC Manager RBAC
  if (userRole === UserRole.FC_MANAGER && assignedFcIds && !assignedFcIds.includes(fc.id)) {
    throw new Error('Forbidden: you do not have permission to trigger AI investigation for this FC');
  }

  // 1. Fetch latest Operations and Labor to verify all 3 files are uploaded
  const [operationsRecord, laborRecord] = await Promise.all([
    prisma.operationalDailyMetrics.findFirst({
      where: { fcId: fc.id, businessDate: submission.businessDate, isLatest: true }
    }),
    prisma.workforceDailyMetrics.findFirst({
      where: { fcId: fc.id, businessDate: submission.businessDate, isLatest: true }
    })
  ]);

  const hasPnl = !!pnl;
  const hasOperations = !!operationsRecord;
  const hasLabor = !!laborRecord;

  // Strict 3-file check
  if (!hasPnl || !hasOperations || !hasLabor) {
    const missing: string[] = [];
    if (!hasPnl) missing.push('Financial P&L');
    if (!hasOperations) missing.push('Daily Operations');
    if (!hasLabor) missing.push('Daily Labor');

    const err: any = new Error(
      `Cannot trigger AI investigation: all three files (Financial P&L, Daily Operations, and Daily Labor) must be uploaded first. Missing: ${missing.join(', ')}`
    );
    err.status = 400;
    err.missingFiles = missing;
    throw err;
  }

  const dateStr = submission.businessDate.toISOString().split('T')[0]!;

  const operationalInput = {
    fcId: fc.code,
    businessDate: dateStr,
    inboundShipments: operationsRecord.inboundShipments,
    outboundOrders: operationsRecord.outboundOrders,
    unitsProcessed: operationsRecord.unitsProcessed,
    orderLinesProcessed: operationsRecord.orderLinesProcessed,
    returnsProcessed: operationsRecord.returnsProcessed,
    operatingHours: Number(operationsRecord.operatingHours),
    storageOccupancyPct: operationsRecord.storageOccupancyPct
      ? Number(operationsRecord.storageOccupancyPct)
      : null
  };

  const laborInput = {
    fcId: fc.code,
    businessDate: dateStr,
    plannedHeadcount: laborRecord.plannedHeadcount,
    actualHeadcount: laborRecord.actualHeadcount,
    plannedLabourHours: Number(laborRecord.plannedLabourHours),
    actualPaidHours: Number(laborRecord.actualPaidHours),
    productiveHours: Number(laborRecord.productiveHours),
    overtimeHours: Number(laborRecord.overtimeHours),
    contractorHeadcount: laborRecord.contractorHeadcount,
    contractorHours: Number(laborRecord.contractorHours),
    contractorCost: laborRecord.contractorCost.toString()
  };

  const operationalMetrics = calculateOperationalMetrics(operationalInput);
  const workforceMetrics = calculateWorkforceMetrics(laborInput, operationalInput);
  const productivityMetrics = calculateProductivityMetrics(
    pnl.manpowerCost.toString(),
    operationalInput,
    laborInput
  );
  const contractorReconciliation = reconcileContractorCosts(
    pnl.manpowerCost.toString(),
    laborRecord.contractorCost ? laborRecord.contractorCost.toString() : null
  );

  const [priorPnls, priorOps, priorLabor] = await Promise.all([
    prisma.dailyPnL.findMany({
      where: {
        submission: {
          fcId: fc.id,
          businessDate: { lt: submission.businessDate },
          isLatest: true
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 30
    }),
    prisma.operationalDailyMetrics.findMany({
      where: {
        fcId: fc.id,
        businessDate: { lt: submission.businessDate },
        isLatest: true
      },
      orderBy: { businessDate: 'desc' },
      take: 30
    }),
    prisma.workforceDailyMetrics.findMany({
      where: {
        fcId: fc.id,
        businessDate: { lt: submission.businessDate },
        isLatest: true
      },
      orderBy: { businessDate: 'desc' },
      take: 30
    })
  ]);

  const historicalComparisons = {
    outboundOrders: compareMetricToHistorical(
      'outboundOrders',
      operationsRecord.outboundOrders,
      priorOps.map(o => ({
        businessDate: o.businessDate.toISOString().split('T')[0]!,
        value: o.outboundOrders
      })),
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
    historicalAverages:
      priorPnls.length > 0
        ? {
            sampleDays: priorPnls.length,
            averageCM2Pct: (
              priorPnls.reduce((acc, p) => acc + Number(p.cm2Pct), 0) / priorPnls.length
            ).toFixed(4)
          }
        : null,
    operationalComparisons: historicalComparisons
  };

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

  const existingLatestReport = await prisma.aIReport.findFirst({
    where: { dailyPnlId: pnl.id, isLatest: true },
    orderBy: { version: 'desc' }
  });

  const nextVersion = existingLatestReport ? existingLatestReport.version + 1 : 1;
  const previousReportId = existingLatestReport ? existingLatestReport.id : null;
  const modelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const promptVersion = 'v2.0.0';

  const inputFingerprint = generateInputFingerprint({
    fcId: fc.id,
    businessDate: dateStr,
    pnlVersion: submission.version,
    operationsVersion: operationsRecord.version,
    laborVersion: laborRecord.version,
    model: modelName,
    promptVersion
  });

  // Execute LangGraph 2-agent AI workflow
  const aiResult = await executeMarginAIWorkflow(
    fc.code,
    dateStr,
    submission.id,
    domainPnL,
    historicalContext,
    undefined,
    {
      operationsData: operationalInput,
      laborData: laborInput,
      completeness: 'COMPLETE',
      diagnosticStatus: 'COMPLETE',
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

  // Persist AI report transactionally
  const report = await prisma.$transaction(async tx => {
    if (existingLatestReport) {
      await tx.aIReport.updateMany({
        where: { dailyPnlId: pnl.id, isLatest: true },
        data: { isLatest: false }
      });
    }

    const prismaDiagnosticStatus =
      aiResult.investigation.diagnosticStatus === 'VALIDATION_FAILED' || (aiResult.investigation.diagnosticStatus as string) === 'FAILED'
        ? 'INSUFFICIENT_DATA'
        : aiResult.investigation.diagnosticStatus;

    const reportStatus =
      aiResult.investigation.diagnosticStatus === 'VALIDATION_FAILED' || (aiResult.investigation.diagnosticStatus as string) === 'FAILED'
        ? AIReportStatus.FAILED
        : AIReportStatus.COMPLETED;

    const created = await tx.aIReport.create({
      data: {
        dailyPnlId: pnl.id,
        version: nextVersion,
        isLatest: true,
        status: reportStatus,
        diagnosticStatus: prismaDiagnosticStatus as any,
        evidenceCompleteness: 'COMPLETE',
        investigation: {
          ...aiResult.investigation,
          tokenUsage: aiResult.tokenUsage,
          investigationContext: aiResult.investigationContext
        } as any,
        recommendations: aiResult.recommendation as any,
        model: modelName,
        promptVersion,
        graphThreadId: `margin:${fc.id}:${dateStr}:${submission.id}:v${nextVersion}`,
        inputFingerprint,
        operationalDataVersion: operationsRecord.version,
        workforceDataVersion: laborRecord.version,
        financialDataVersion: submission.version,
        targetRulesVersion: 1,
        previousReportId,
        generatedAt: new Date()
      }
    });

    await tx.dailyPnL.update({
      where: { id: pnl.id },
      data: { latestAiReportId: created.id }
    });

    return created;
  });

  return {
    message: 'AI investigation completed successfully',
    reportId: report.id,
    version: report.version,
    report,
    findingsCount: aiResult.investigation.findings.length,
    recommendationsCount: aiResult.recommendation.recommendations.length
  };
}
