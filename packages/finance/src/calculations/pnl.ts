import { Decimal } from 'decimal.js';
import {
  COST_LINES,
  CostLine,
  FCColour,
  TARGET_BANDS,
  CalculatedCostLine,
  CalculatedPnL,
  DetectedAnomaly,
  TargetSnapshot,
  NormalizedFCRecord,
  Severity
} from '@prozo/shared';

// Ensure 20 digits of precision for financial operations
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Validates that revenue is valid and positive.
 */
export function validateRevenue(revenue: string | number | Decimal): Decimal {
  try {
    const rev = new Decimal(revenue);
    if (rev.isNaN() || !rev.isFinite() || rev.lte(0)) {
      throw new Error(`Invalid revenue: must be a positive number, got ${revenue}`);
    }
    return rev;
  } catch (err: any) {
    throw new Error(`Invalid revenue: must be a positive number, got ${revenue}`);
  }
}

/**
 * Validates non-negative cost.
 */
export function validateCost(cost: string | number | Decimal, name: string): Decimal {
  try {
    const c = new Decimal(cost);
    if (c.isNaN() || !c.isFinite() || c.lt(0)) {
      throw new Error(`Invalid ${name}: must be a non-negative number, got ${cost}`);
    }
    return c;
  } catch (err: any) {
    throw new Error(`Invalid ${name}: must be a non-negative number, got ${cost}`);
  }
}

/**
 * Calculate cost percentage: (Cost / Revenue) * 100
 */
export function calculatePercentage(amount: Decimal, revenue: Decimal): Decimal {
  if (revenue.isZero()) return new Decimal(0);
  return amount.div(revenue).mul(100);
}

/**
 * Calculate CM1: Revenue - Manpower - Packaging
 */
export function calculateCM1(revenue: Decimal, manpower: Decimal, packaging: Decimal): Decimal {
  return revenue.minus(manpower).minus(packaging);
}

/**
 * Calculate CM2: CM1 - Power&Fuel - FCRent - EquipmentRentals - Overheads
 */
export function calculateCM2(
  cm1: Decimal,
  powerFuel: Decimal,
  fcRent: Decimal,
  equipment: Decimal,
  overheads: Decimal
): Decimal {
  return cm1.minus(powerFuel).minus(fcRent).minus(equipment).minus(overheads);
}

/**
 * Deterministic FC colour classification based on CM2 percentage:
 * RED: CM2% < 12%
 * YELLOW: 12% <= CM2% < 15% OR 30% < CM2% <= 33%
 * GREEN: 15% <= CM2% <= 30%
 * BLUE: CM2% > 33%
 */
export function classifyFCColour(cm2Pct: Decimal): FCColour {
  if (cm2Pct.lt(12)) {
    return 'RED';
  }
  if (cm2Pct.gte(12) && cm2Pct.lt(15)) {
    return 'YELLOW';
  }
  if (cm2Pct.gte(15) && cm2Pct.lte(30)) {
    return 'GREEN';
  }
  if (cm2Pct.gt(30) && cm2Pct.lte(33)) {
    return 'YELLOW';
  }
  // cm2Pct > 33
  return 'BLUE';
}

/**
 * Deterministic CM1 & CM2 margin anomaly detection:
 * CM1 anomaly when CM1% < 62% OR CM1% > 73% (inclusive tolerance envelope: 62% and 73% are NOT anomalies)
 * CM2 anomaly when CM2% < 12% OR CM2% > 33% (inclusive tolerance envelope: 12% and 33% are NOT anomalies)
 */
export function detectMarginAnomalies(
  cm1Pct: Decimal,
  cm2Pct: Decimal,
  revenue: Decimal
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  // CM1 Anomaly Check
  if (cm1Pct.lt(62)) {
    const deviationFromTargetPP = new Decimal(65).minus(cm1Pct); // relative to base target min (65%)
    const breachBeyondTolerancePP = new Decimal(62).minus(cm1Pct); // relative to tolerance lower bound (62%)
    const impactAmount = revenue.mul(deviationFromTargetPP.div(100)).toFixed(2);
    anomalies.push({
      type: 'CM1_DEVIATION',
      metricKey: 'CM1',
      actualPct: cm1Pct.toFixed(4),
      targetMinPct: TARGET_BANDS.CM1.min,
      targetMaxPct: TARGET_BANDS.CM1.max,
      deviationPP: deviationFromTargetPP.toFixed(4),
      deviationFromTargetPP: deviationFromTargetPP.toFixed(4),
      breachBeyondTolerancePP: breachBeyondTolerancePP.toFixed(4),
      impactAmount,
      severity: cm1Pct.lt(58) ? 'CRITICAL' : 'HIGH',
      description: `CM1 margin (${cm1Pct.toFixed(2)}%) breached lower tolerance threshold of 62% by ${breachBeyondTolerancePP.toFixed(2)}pp (Target: 65%-70%, Deviation: ${deviationFromTargetPP.toFixed(2)}pp)`
    });
  } else if (cm1Pct.gt(73)) {
    const deviationFromTargetPP = cm1Pct.minus(70); // relative to base target max (70%)
    const breachBeyondTolerancePP = cm1Pct.minus(73); // relative to tolerance upper bound (73%)
    anomalies.push({
      type: 'CM1_DEVIATION',
      metricKey: 'CM1',
      actualPct: cm1Pct.toFixed(4),
      targetMinPct: TARGET_BANDS.CM1.min,
      targetMaxPct: TARGET_BANDS.CM1.max,
      deviationPP: deviationFromTargetPP.toFixed(4),
      deviationFromTargetPP: deviationFromTargetPP.toFixed(4),
      breachBeyondTolerancePP: breachBeyondTolerancePP.toFixed(4),
      impactAmount: null,
      severity: 'MEDIUM',
      description: `CM1 margin (${cm1Pct.toFixed(2)}%) breached upper tolerance threshold of 73% by ${breachBeyondTolerancePP.toFixed(2)}pp (Target: 65%-70%, Deviation: ${deviationFromTargetPP.toFixed(2)}pp)`
    });
  }

  // CM2 Anomaly Check
  if (cm2Pct.lt(12)) {
    const deviationFromTargetPP = new Decimal(15).minus(cm2Pct); // relative to base target min (15%)
    const breachBeyondTolerancePP = new Decimal(12).minus(cm2Pct); // relative to tolerance lower bound (12%)
    const impactAmount = revenue.mul(deviationFromTargetPP.div(100)).toFixed(2);
    anomalies.push({
      type: 'CM2_DEVIATION',
      metricKey: 'CM2',
      actualPct: cm2Pct.toFixed(4),
      targetMinPct: TARGET_BANDS.CM2.min,
      targetMaxPct: TARGET_BANDS.CM2.max,
      deviationPP: deviationFromTargetPP.toFixed(4),
      deviationFromTargetPP: deviationFromTargetPP.toFixed(4),
      breachBeyondTolerancePP: breachBeyondTolerancePP.toFixed(4),
      impactAmount,
      severity: cm2Pct.lt(8) ? 'CRITICAL' : 'HIGH',
      description: `CM2 margin (${cm2Pct.toFixed(2)}%) breached lower tolerance threshold of 12% by ${breachBeyondTolerancePP.toFixed(2)}pp (Target: 15%-30%, Deviation: ${deviationFromTargetPP.toFixed(2)}pp)`
    });
  } else if (cm2Pct.gt(33)) {
    const deviationFromTargetPP = cm2Pct.minus(30); // relative to base target max (30%)
    const breachBeyondTolerancePP = cm2Pct.minus(33); // relative to tolerance upper bound (33%)
    anomalies.push({
      type: 'SUSPICIOUS_HIGH_MARGIN',
      metricKey: 'CM2',
      actualPct: cm2Pct.toFixed(4),
      targetMinPct: TARGET_BANDS.CM2.min,
      targetMaxPct: TARGET_BANDS.CM2.max,
      deviationPP: deviationFromTargetPP.toFixed(4),
      deviationFromTargetPP: deviationFromTargetPP.toFixed(4),
      breachBeyondTolerancePP: breachBeyondTolerancePP.toFixed(4),
      impactAmount: null,
      severity: 'MEDIUM',
      description: `CM2 margin (${cm2Pct.toFixed(2)}%) is suspiciously high above 33% by ${breachBeyondTolerancePP.toFixed(2)}pp (Target: 15%-30%, Deviation: ${deviationFromTargetPP.toFixed(2)}pp). Possible omitted expenses.`
    });
  }

  return anomalies;
}

/**
 * Evaluates a single cost line against target min/max.
 * Excess Cost = Actual Cost - (Revenue * Max Target % / 100)
 */
export function evaluateCostLine(
  lineItem: CostLine,
  amount: Decimal,
  revenue: Decimal,
  targetSnapshot: TargetSnapshot
): { calculated: CalculatedCostLine; anomaly: DetectedAnomaly | null } {
  const percentage = calculatePercentage(amount, revenue);
  const target = targetSnapshot[lineItem];

  if (!target || target.minPct === null || target.maxPct === null) {
    return {
      calculated: {
        lineItem,
        amount: amount.toFixed(2),
        percentage: percentage.toFixed(4),
        targetMinPct: null,
        targetMaxPct: null,
        status: 'TARGET_NOT_CONFIGURED',
        excessAmount: null
      },
      anomaly: null
    };
  }

  const min = new Decimal(target.minPct);
  const max = new Decimal(target.maxPct);

  if (percentage.gt(max)) {
    // Overrun breach: Excess Cost = Actual Cost - (Revenue * Max Target % / 100)
    const allowedCost = revenue.mul(max.div(100));
    const excessCost = Decimal.max(0, amount.minus(allowedCost));
    const deviationPP = percentage.minus(max);

    const severity: Severity = excessCost.gt(revenue.mul(0.05)) ? 'CRITICAL' : 'HIGH';

    return {
      calculated: {
        lineItem,
        amount: amount.toFixed(2),
        percentage: percentage.toFixed(4),
        targetMinPct: min.toFixed(4),
        targetMaxPct: max.toFixed(4),
        status: 'ABOVE_MAX',
        excessAmount: excessCost.toFixed(2)
      },
      anomaly: {
        type: 'COST_ABOVE_MAX',
        metricKey: lineItem,
        actualPct: percentage.toFixed(4),
        targetMinPct: min.toFixed(4),
        targetMaxPct: max.toFixed(4),
        deviationPP: deviationPP.toFixed(4),
        deviationFromTargetPP: deviationPP.toFixed(4),
        breachBeyondTolerancePP: deviationPP.toFixed(4),
        impactAmount: excessCost.toFixed(2),
        severity,
        description: `${lineItem} (${percentage.toFixed(2)}%) exceeded max target of ${max.toFixed(2)}% by ${deviationPP.toFixed(2)}pp (Overrun: ${excessCost.toFixed(2)})`
      }
    };
  }

  if (percentage.lt(min)) {
    const deviationPP = min.minus(percentage);
    return {
      calculated: {
        lineItem,
        amount: amount.toFixed(2),
        percentage: percentage.toFixed(4),
        targetMinPct: min.toFixed(4),
        targetMaxPct: max.toFixed(4),
        status: 'BELOW_MIN',
        excessAmount: null
      },
      anomaly: {
        type: 'COST_BELOW_MIN',
        metricKey: lineItem,
        actualPct: percentage.toFixed(4),
        targetMinPct: min.toFixed(4),
        targetMaxPct: max.toFixed(4),
        deviationPP: deviationPP.toFixed(4),
        deviationFromTargetPP: deviationPP.toFixed(4),
        breachBeyondTolerancePP: null,
        impactAmount: null,
        severity: 'LOW',
        description: `${lineItem} (${percentage.toFixed(2)}%) is below minimum target of ${min.toFixed(2)}% by ${deviationPP.toFixed(2)}pp. Unusual underspend or potential data-quality concern.`
      }
    };
  }

  // Exact min or max or inside range
  return {
    calculated: {
      lineItem,
      amount: amount.toFixed(2),
      percentage: percentage.toFixed(4),
      targetMinPct: min.toFixed(4),
      targetMaxPct: max.toFixed(4),
      status: 'IN_RANGE',
      excessAmount: null
    },
    anomaly: null
  };
}

/**
 * Calculates complete Daily P&L and all anomalies deterministically.
 */
export function calculateDailyPnL(
  record: NormalizedFCRecord,
  targetSnapshot: TargetSnapshot
): CalculatedPnL {
  const revenue = validateRevenue(record.revenue);
  const manpower = validateCost(record.manpowerCost, 'manpowerCost');
  const packaging = validateCost(record.packagingCost, 'packagingCost');
  const powerFuel = validateCost(record.powerFuelCost, 'powerFuelCost');
  const fcRent = validateCost(record.fcRent, 'fcRent');
  const equipment = validateCost(record.equipmentRentals, 'equipmentRentals');
  const overheads = validateCost(record.overheads, 'overheads');

  const cm1 = calculateCM1(revenue, manpower, packaging);
  const cm1Pct = calculatePercentage(cm1, revenue);

  const cm2 = calculateCM2(cm1, powerFuel, fcRent, equipment, overheads);
  const cm2Pct = calculatePercentage(cm2, revenue);

  const colour = classifyFCColour(cm2Pct);

  // Evaluate each of the 6 cost lines
  const costInputs: Record<CostLine, Decimal> = {
    MANPOWER: manpower,
    PACKAGING: packaging,
    POWER_AND_FUEL: powerFuel,
    FC_RENT: fcRent,
    EQUIPMENT_RENTALS: equipment,
    OVERHEADS: overheads
  };

  const calculatedCostLines: CalculatedCostLine[] = [];
  const costAnomalies: DetectedAnomaly[] = [];

  for (const line of COST_LINES) {
    const { calculated, anomaly } = evaluateCostLine(
      line,
      costInputs[line],
      revenue,
      targetSnapshot
    );
    calculatedCostLines.push(calculated);
    if (anomaly) {
      costAnomalies.push(anomaly);
    }
  }

  // Sort upper-breach cost contributors by excess amount descending
  costAnomalies.sort((a, b) => {
    const impactA = a.impactAmount ? new Decimal(a.impactAmount) : new Decimal(0);
    const impactB = b.impactAmount ? new Decimal(b.impactAmount) : new Decimal(0);
    return impactB.comparedTo(impactA);
  });

  // Evaluate margin anomalies
  const marginAnomalies = detectMarginAnomalies(cm1Pct, cm2Pct, revenue);

  const allAnomalies = [...marginAnomalies, ...costAnomalies];

  return {
    revenue: revenue.toFixed(2),
    currency: record.currency || 'INR',
    manpowerCost: manpower.toFixed(2),
    packagingCost: packaging.toFixed(2),
    powerFuelCost: powerFuel.toFixed(2),
    fcRent: fcRent.toFixed(2),
    equipmentRentals: equipment.toFixed(2),
    overheads: overheads.toFixed(2),
    costLines: calculatedCostLines,
    cm1: cm1.toFixed(2),
    cm1Pct: cm1Pct.toFixed(4),
    cm2: cm2.toFixed(2),
    cm2Pct: cm2Pct.toFixed(4),
    colour,
    targetSnapshot,
    anomalies: allAnomalies
  };
}

/**
 * Calculates weighted multi-FC aggregate CM percentages:
 * Aggregate CM1% = SUM(CM1) / SUM(Revenue) * 100
 * Aggregate CM2% = SUM(CM2) / SUM(Revenue) * 100
 */
export function calculateWeightedAggregates(
  pnls: Array<{ revenue: string | number; cm1: string | number; cm2: string | number }>
): {
  totalRevenue: string;
  totalCM1: string;
  totalCM2: string;
  weightedCM1Pct: string;
  weightedCM2Pct: string;
} {
  let totalRevenue = new Decimal(0);
  let totalCM1 = new Decimal(0);
  let totalCM2 = new Decimal(0);

  for (const p of pnls) {
    totalRevenue = totalRevenue.plus(new Decimal(p.revenue));
    totalCM1 = totalCM1.plus(new Decimal(p.cm1));
    totalCM2 = totalCM2.plus(new Decimal(p.cm2));
  }

  const weightedCM1Pct = totalRevenue.isZero()
    ? new Decimal(0)
    : totalCM1.div(totalRevenue).mul(100);

  const weightedCM2Pct = totalRevenue.isZero()
    ? new Decimal(0)
    : totalCM2.div(totalRevenue).mul(100);

  return {
    totalRevenue: totalRevenue.toFixed(2),
    totalCM1: totalCM1.toFixed(2),
    totalCM2: totalCM2.toFixed(2),
    weightedCM1Pct: weightedCM1Pct.toFixed(4),
    weightedCM2Pct: weightedCM2Pct.toFixed(4)
  };
}
