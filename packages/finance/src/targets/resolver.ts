import { CostLine, COST_LINES, TargetSnapshot } from '@prozo/shared';

export interface TargetRuleEntity {
  id: string;
  fcId: string | null;
  metricKey: string;
  minPct: string;
  maxPct: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // YYYY-MM-DD
}

/**
 * Standard illustrative default targets used ONLY when workbook is absent
 * and no database rules exist yet. Clearly marked as illustrative.
 */
export const ILLUSTRATIVE_DEFAULT_COST_TARGETS: Record<CostLine, { minPct: string; maxPct: string }> = {
  MANPOWER: { minPct: '15.0000', maxPct: '20.0000' },
  PACKAGING: { minPct: '8.0000', maxPct: '12.0000' },
  POWER_AND_FUEL: { minPct: '3.0000', maxPct: '6.0000' },
  FC_RENT: { minPct: '10.0000', maxPct: '15.0000' },
  EQUIPMENT_RENTALS: { minPct: '2.0000', maxPct: '5.0000' },
  OVERHEADS: { minPct: '3.0000', maxPct: '7.0000' }
};

/**
 * Resolves effective target snapshot for an FC and business date.
 * Precedence:
 * 1. FC-specific rule active on businessDate
 * 2. Global rule (fcId === null) active on businessDate
 * 3. TARGET_NOT_CONFIGURED
 */
export function resolveTargetSnapshot(
  fcId: string,
  businessDate: string,
  rules: TargetRuleEntity[],
  allowIllustrativeDefaults = false
): TargetSnapshot {
  const snapshot: TargetSnapshot = {};

  for (const lineItem of COST_LINES) {
    // Find matching active rules
    const activeRules = rules.filter(r => {
      if (r.metricKey !== lineItem) return false;
      if (r.effectiveFrom > businessDate) return false;
      if (r.effectiveTo && r.effectiveTo < businessDate) return false;
      return true;
    });

    // 1. FC-specific rule
    const fcSpecificRule = activeRules.find(r => r.fcId === fcId);
    if (fcSpecificRule) {
      snapshot[lineItem] = {
        metricKey: lineItem,
        minPct: fcSpecificRule.minPct,
        maxPct: fcSpecificRule.maxPct,
        ruleId: fcSpecificRule.id,
        isFcSpecific: true
      };
      continue;
    }

    // 2. Global rule
    const globalRule = activeRules.find(r => r.fcId === null);
    if (globalRule) {
      snapshot[lineItem] = {
        metricKey: lineItem,
        minPct: globalRule.minPct,
        maxPct: globalRule.maxPct,
        ruleId: globalRule.id,
        isFcSpecific: false
      };
      continue;
    }

    // 3. Illustrative default or not configured
    if (allowIllustrativeDefaults && ILLUSTRATIVE_DEFAULT_COST_TARGETS[lineItem]) {
      snapshot[lineItem] = {
        metricKey: lineItem,
        minPct: ILLUSTRATIVE_DEFAULT_COST_TARGETS[lineItem].minPct,
        maxPct: ILLUSTRATIVE_DEFAULT_COST_TARGETS[lineItem].maxPct,
        isFcSpecific: false
      };
    } else {
      snapshot[lineItem] = {
        metricKey: lineItem,
        minPct: null,
        maxPct: null,
        isFcSpecific: false
      };
    }
  }

  return snapshot;
}
