import {
  CalculatedPnL,
  DailyOperationsInput,
  DailyLaborInput,
  EvidenceCompleteness,
  DiagnosticStatus,
  InvestigationContext
} from '@prozo/shared';
import { EvidenceRegistry } from './evidence-registry.js';

export interface BuildInvestigationContextParams {
  fcId: string;
  businessDate: string;
  pnl: CalculatedPnL;
  operationsData?: DailyOperationsInput | null;
  laborData?: DailyLaborInput | null;
  derivedMetrics?: any;
  historicalContext?: any;
  completeness?: EvidenceCompleteness;
  diagnosticStatus?: DiagnosticStatus;
}

export function buildInvestigationContext(params: {
  fcId: string;
  businessDate: string;
  pnl: CalculatedPnL;
  operationsData?: DailyOperationsInput | null;
  laborData?: DailyLaborInput | null;
  derivedMetrics?: any;
  historicalContext?: any;
  completeness?: EvidenceCompleteness;
  diagnosticStatus?: DiagnosticStatus;
}): {
  context: InvestigationContext;
  evidenceRegistry: EvidenceRegistry;
  compactPayload: Record<string, any>;
} {
  const {
    fcId,
    businessDate,
    pnl,
    operationsData,
    laborData,
    derivedMetrics,
    historicalContext
  } = params;

  const registry = new EvidenceRegistry();

  // 1. Data Availability
  const hasPnl = !!pnl && !!pnl.revenue;
  const hasOperations = !!operationsData;
  const hasLabor = !!laborData;

  const priorSubmissionsCount = historicalContext?.priorSubmissionsCount || 0;
  const hasHistorical = priorSubmissionsCount > 0;

  const dataAvailability = {
    pnl: hasPnl,
    operations: hasOperations,
    labor: hasLabor,
    historical: hasHistorical
  };

  // 2. Register Financial Facts into Evidence Registry
  registry.register('REVENUE', pnl.revenue, 'INR', 'Daily P&L', 'Total Daily Invoiced Revenue');
  registry.register('CM1', pnl.cm1, 'INR', 'Daily P&L', 'Contribution Margin 1 Amount');
  registry.register('CM1_PCT', pnl.cm1Pct, '%', 'Daily P&L', 'Contribution Margin 1 Percentage');
  registry.register('CM2', pnl.cm2, 'INR', 'Daily P&L', 'Contribution Margin 2 Amount');
  registry.register('CM2_PCT', pnl.cm2Pct, '%', 'Daily P&L', 'Contribution Margin 2 Percentage');
  registry.register('FC_COLOUR', pnl.colour, 'status', 'Daily P&L', 'Margin Health Colour Classification');

  const financialCosts = pnl.costLines.map(c => {
    const regPctKey = `${c.lineItem}_COST_PCT`;
    const regAmtKey = `${c.lineItem}_COST_AMOUNT`;
    registry.register(regPctKey, c.percentage, '%', 'Daily P&L', `${c.lineItem} Cost as % of Revenue`);
    registry.register(regAmtKey, c.amount, 'INR', 'Daily P&L', `${c.lineItem} Cost in INR`);
    if (c.excessAmount) {
      registry.register(`${c.lineItem}_EXCESS_AMOUNT`, c.excessAmount, 'INR', 'Daily P&L', `Excess Cost Amount for ${c.lineItem}`);
    }

    return {
      lineItem: c.lineItem,
      amount: c.amount,
      actualPct: c.percentage,
      targetMinPct: c.targetMinPct ?? 'N/A',
      targetMaxPct: c.targetMaxPct ?? 'N/A',
      status: c.status,
      excessAmount: c.excessAmount || null
    };
  });

  const financial = {
    revenue: pnl.revenue,
    cm1: pnl.cm1,
    cm1Pct: pnl.cm1Pct,
    cm2: pnl.cm2,
    cm2Pct: pnl.cm2Pct,
    colour: pnl.colour,
    costs: financialCosts
  };

  // 3. Normalized Anomalies (with deviationFromTargetPP and breachBeyondTolerancePP)
  const anomalies = pnl.anomalies.map((a, idx) => {
    const id = `anom-${idx + 1}`;
    const deviationFromTargetPP = a.deviationFromTargetPP ?? a.deviationPP ?? null;
    const breachBeyondTolerancePP = a.breachBeyondTolerancePP ?? a.deviationPP ?? null;

    return {
      id,
      metricKey: a.metricKey,
      type: a.type,
      severity: a.severity,
      deviationFromTargetPP,
      breachBeyondTolerancePP
    };
  });

  // 4. Operations (compact, non-redundant)
  let operations: InvestigationContext['operations'] = null;
  if (operationsData) {
    operations = {
      inboundShipments: operationsData.inboundShipments,
      outboundOrders: operationsData.outboundOrders,
      unitsProcessed: operationsData.unitsProcessed,
      orderLinesProcessed: operationsData.orderLinesProcessed,
      returnsProcessed: operationsData.returnsProcessed,
      operatingHours: operationsData.operatingHours,
      storageOccupancyPct: operationsData.storageOccupancyPct
    };

    registry.register('INBOUND_SHIPMENTS', operations.inboundShipments, 'shipments', 'Daily_Operations', 'Inbound Shipments');
    registry.register('OUTBOUND_ORDERS', operations.outboundOrders, 'orders', 'Daily_Operations', 'Outbound Dispatch Orders');
    registry.register('UNITS_PROCESSED', operations.unitsProcessed, 'units', 'Daily_Operations', 'Total Units Picked and Packed');
    registry.register('ORDER_LINES_PROCESSED', operations.orderLinesProcessed, 'lines', 'Daily_Operations', 'Order Lines Processed');
    registry.register('RETURNS_PROCESSED', operations.returnsProcessed, 'units', 'Daily_Operations', 'Customer Returns Handled');
    registry.register('OPERATING_HOURS', operations.operatingHours, 'hours', 'Daily_Operations', 'Facility Operating Hours');
    if (operations.storageOccupancyPct !== null && operations.storageOccupancyPct !== undefined) {
      registry.register('STORAGE_OCCUPANCY_PCT', operations.storageOccupancyPct, '%', 'Daily_Operations', 'Storage Capacity Occupancy');
    }
  }

  // 5. Labor (compact, non-redundant)
  let labor: InvestigationContext['labor'] = null;
  if (laborData) {
    labor = {
      plannedHeadcount: laborData.plannedHeadcount,
      actualHeadcount: laborData.actualHeadcount,
      plannedHours: laborData.plannedLabourHours,
      paidHours: laborData.actualPaidHours,
      productiveHours: laborData.productiveHours,
      overtimeHours: laborData.overtimeHours,
      contractorHeadcount: laborData.contractorHeadcount,
      contractorHours: laborData.contractorHours,
      contractorCost: laborData.contractorCost
    };

    registry.register('PLANNED_HEADCOUNT', labor.plannedHeadcount, 'workers', 'Daily_Labor', 'Planned Shift Headcount');
    registry.register('ACTUAL_HEADCOUNT', labor.actualHeadcount, 'workers', 'Daily_Labor', 'Actual Attended Headcount');
    registry.register('PLANNED_HOURS', labor.plannedHours, 'hours', 'Daily_Labor', 'Planned Labor Hours');
    registry.register('ACTUAL_PAID_HOURS', labor.paidHours, 'hours', 'Daily_Labor', 'Total Actual Paid Hours');
    registry.register('PRODUCTIVE_HOURS', labor.productiveHours, 'hours', 'Daily_Labor', 'Direct Productive Working Hours');
    registry.register('OVERTIME_HOURS', labor.overtimeHours, 'hours', 'Daily_Labor', 'Overtime Hours Incurred');
    registry.register('CONTRACTOR_HEADCOUNT', labor.contractorHeadcount, 'workers', 'Daily_Labor', 'Temporary Agency Headcount');
    registry.register('CONTRACTOR_HOURS', labor.contractorHours, 'hours', 'Daily_Labor', 'Temporary Agency Paid Hours');
    registry.register('CONTRACTOR_COST', labor.contractorCost, 'INR', 'Daily_Labor', 'Reported Contractor Expense');
  }

  // 6. Derived Metrics (compact, only present non-null values)
  const metrics: InvestigationContext['metrics'] = {};

  const opm = derivedMetrics?.operational;
  if (opm) {
    if (typeof opm.averageOrderLines === 'number') metrics.averageOrderLines = opm.averageOrderLines;
    if (typeof opm.unitsPerOrder === 'number') {
      metrics.unitsPerOrder = opm.unitsPerOrder;
      registry.register('UNITS_PER_ORDER', opm.unitsPerOrder, 'units/order', 'Derived Operational Metrics');
    }
    if (typeof opm.ordersPerOperatingHour === 'number') metrics.ordersPerOperatingHour = opm.ordersPerOperatingHour;
    if (typeof opm.returnsRate === 'number') metrics.returnsRatePct = opm.returnsRate;
  }

  const wfm = derivedMetrics?.workforce;
  if (wfm) {
    if (typeof wfm.labourUtilization === 'number') {
      metrics.labourUtilizationPct = wfm.labourUtilization;
      registry.register('LABOUR_UTILIZATION_PCT', wfm.labourUtilization, '%', 'Derived Workforce Metrics', 'Productive / Actual Paid Hours');
    }
    if (typeof wfm.overtimeRatio === 'number') {
      metrics.overtimeRatioPct = wfm.overtimeRatio;
      registry.register('OVERTIME_RATIO_PCT', wfm.overtimeRatio, '%', 'Derived Workforce Metrics', 'Overtime / Actual Paid Hours');
    }
    if (typeof wfm.ordersPerPaidLabourHour === 'number') {
      metrics.ordersPerPaidHour = wfm.ordersPerPaidLabourHour;
      registry.register('ORDERS_PER_PAID_HOUR', wfm.ordersPerPaidLabourHour, 'orders/hour', 'Derived Workforce Metrics');
    }
    if (typeof wfm.unitsPerProductiveLabourHour === 'number') metrics.unitsPerProductiveHour = wfm.unitsPerProductiveLabourHour;
    if (typeof wfm.actualVsPlannedLabourHours === 'number') metrics.actualVsPlannedHoursPct = wfm.actualVsPlannedLabourHours;
    if (typeof wfm.contractorHourShare === 'number') {
      metrics.contractorHourSharePct = wfm.contractorHourShare;
      registry.register('CONTRACTOR_HOUR_SHARE_PCT', wfm.contractorHourShare, '%', 'Derived Workforce Metrics');
    }
  }

  const pdm = derivedMetrics?.productivity;
  if (pdm) {
    if (typeof pdm.manpowerCostPerOrder === 'number') {
      metrics.manpowerCostPerOrder = pdm.manpowerCostPerOrder;
      registry.register('MANPOWER_COST_PER_ORDER', pdm.manpowerCostPerOrder, 'INR/order', 'Derived Productivity Metrics');
    }
    if (typeof pdm.manpowerCostPerPaidHour === 'number') {
      metrics.manpowerCostPerPaidHour = pdm.manpowerCostPerPaidHour;
      registry.register('MANPOWER_COST_PER_PAID_HOUR', pdm.manpowerCostPerPaidHour, 'INR/hour', 'Derived Productivity Metrics');
    }
    if (typeof pdm.contractorCostShareOfManpower === 'number') {
      metrics.contractorCostSharePct = pdm.contractorCostShareOfManpower;
      registry.register('CONTRACTOR_COST_SHARE_PCT', pdm.contractorCostShareOfManpower, '%', 'Derived Productivity Metrics');
    }
  }

  // 7. Reconciliation Context (incorporating rate and allocation review signals)
  const rec = derivedMetrics?.reconciliation;
  const warnings: string[] = [];
  if (rec?.description && rec?.hasDiscrepancy) {
    warnings.push(rec.description);
  }

  const reconciliation: InvestigationContext['reconciliation'] = {
    status: rec?.hasDiscrepancy ? 'DISCREPANCY_FLAGGED' : (rec?.signal === 'RATE_AND_ALLOCATION_REVIEW' ? 'RATE_AND_ALLOCATION_REVIEW' : 'NORMAL'),
    warnings,
    contractorCostSharePct: rec?.contractorCostSharePct ?? metrics.contractorCostSharePct ?? null,
    contractorHourSharePct: rec?.contractorHourSharePct ?? metrics.contractorHourSharePct ?? null,
    contractorCostPerHour: rec?.contractorCostPerHour ?? null,
    nonContractorCostPerHour: rec?.nonContractorCostPerHour ?? null,
    signal: rec?.signal ?? 'NORMAL',
    assumptions: rec?.assumptions ?? []
  };

  if (reconciliation.signal === 'RATE_AND_ALLOCATION_REVIEW') {
    registry.register(
      'RATE_AND_ALLOCATION_REVIEW_SIGNAL',
      `Cost Share ${reconciliation.contractorCostSharePct}% vs Hour Share ${reconciliation.contractorHourSharePct}%`,
      'signal',
      'Cost Reconciliation',
      'Contractor rate and allocation divergence requiring operational confirmation'
    );
  }

  // 8. History (compact canonical representation, no null-filled objects)
  let history: InvestigationContext['history'] = {
    available: false,
    sampleSize: 0,
    metrics: [],
    recurringAnomalyCount: 0
  };

  if (hasHistorical) {
    const historicalMetrics: InvestigationContext['history']['metrics'] = [];
    const opComparisons = historicalContext?.operationalComparisons || {};

    for (const [k, v] of Object.entries<any>(opComparisons)) {
      if (v && v.sampleSize > 0 && typeof v.baselineValue === 'number') {
        historicalMetrics.push({
          metric: k,
          currentValue: Number(v.currentValue ?? 0),
          baselineValue: Number(v.baselineValue),
          changePct: Number(v.percentageChange ?? 0),
          unit: v.unit || ''
        });

        registry.register(`BASELINE_${k.toUpperCase()}`, v.baselineValue, v.unit || '', 'Historical Baselines', `Historical average for ${k}`);
      }
    }

    history = {
      available: true,
      sampleSize: priorSubmissionsCount,
      metrics: historicalMetrics,
      recurringAnomalyCount: historicalContext?.recurringAnomalyCount ?? 0
    };
  }

  const context: InvestigationContext = {
    fcId,
    businessDate,
    dataAvailability,
    financial,
    anomalies,
    operations,
    labor,
    metrics,
    reconciliation,
    history,
    evidenceRegistry: registry.getAll()
  };

  // Compact payload strictly formatted for LLM consumption
  const compactPayload = {
    fcId,
    businessDate,
    dataAvailability,
    financial,
    anomalies,
    operations,
    labor,
    metrics,
    reconciliation: {
      status: reconciliation.status,
      signal: reconciliation.signal,
      contractorCostSharePct: reconciliation.contractorCostSharePct,
      contractorHourSharePct: reconciliation.contractorHourSharePct,
      contractorCostPerHour: reconciliation.contractorCostPerHour,
      nonContractorCostPerHour: reconciliation.nonContractorCostPerHour,
      assumptions: reconciliation.assumptions
    },
    history,
    evidenceRegistry: registry.toEvidenceIndex()
  };

  return { context, evidenceRegistry: registry, compactPayload };
}
