import { describe, it, expect } from 'vitest';
import {
  calculateCM1,
  calculateCM2,
  calculatePercentage,
  classifyFCColour,
  detectMarginAnomalies,
  evaluateCostLine,
  calculateDailyPnL,
  calculateWeightedAggregates,
  validateRevenue,
  validateCost
} from '../../packages/finance/src/calculations/pnl.js';
import { resolveTargetSnapshot, ILLUSTRATIVE_DEFAULT_COST_TARGETS } from '../../packages/finance/src/targets/resolver.js';
import { TargetSnapshot, NormalizedFCRecord, Decimal } from '@prozo/shared';

describe('Financial Engine - Section 14.1 Unit Tests', () => {
  describe('Basic CM1 & CM2 and Percentage Arithmetic', () => {
    it('calculates six cost percentages accurately using Decimal', () => {
      const revenue = new Decimal('100000.00');
      const cost = new Decimal('15000.00');
      const pct = calculatePercentage(cost, revenue);
      expect(pct.toString()).toBe('15');
    });

    it('calculates CM1 and CM1% correctly', () => {
      const revenue = new Decimal('100000');
      const manpower = new Decimal('18000');
      const packaging = new Decimal('10000');
      const cm1 = calculateCM1(revenue, manpower, packaging);
      const cm1Pct = calculatePercentage(cm1, revenue);

      expect(cm1.toString()).toBe('72000');
      expect(cm1Pct.toString()).toBe('72');
    });

    it('calculates CM2 and CM2% correctly', () => {
      const cm1 = new Decimal('72000');
      const powerFuel = new Decimal('5000');
      const fcRent = new Decimal('12000');
      const equipment = new Decimal('3000');
      const overheads = new Decimal('4000');

      const cm2 = calculateCM2(cm1, powerFuel, fcRent, equipment, overheads);
      const revenue = new Decimal('100000');
      const cm2Pct = calculatePercentage(cm2, revenue);

      expect(cm2.toString()).toBe('48000');
      expect(cm2Pct.toString()).toBe('48');
    });

    it('rejects zero or negative revenue', () => {
      expect(() => validateRevenue('0')).toThrow(/must be a positive number/);
      expect(() => validateRevenue('-100')).toThrow(/must be a positive number/);
      expect(() => validateRevenue('abc')).toThrow(/Invalid revenue/);
    });

    it('rejects negative cost', () => {
      expect(() => validateCost('-50', 'manpowerCost')).toThrow(/must be a non-negative number/);
    });
  });

  describe('FC Colour Boundaries (Section 14.1 table)', () => {
    // Expected CM2 boundary tests:
    // 11.99 -> RED
    // 12.00 -> YELLOW
    // 14.99 -> YELLOW
    // 15.00 -> GREEN
    // 30.00 -> GREEN
    // 30.01 -> YELLOW
    // 33.00 -> YELLOW
    // 33.01 -> BLUE
    it('classifies 11.99 as RED', () => {
      expect(classifyFCColour(new Decimal('11.99'))).toBe('RED');
    });

    it('classifies 12.00 as YELLOW', () => {
      expect(classifyFCColour(new Decimal('12.00'))).toBe('YELLOW');
    });

    it('classifies 14.99 as YELLOW', () => {
      expect(classifyFCColour(new Decimal('14.99'))).toBe('YELLOW');
    });

    it('classifies 15.00 as GREEN', () => {
      expect(classifyFCColour(new Decimal('15.00'))).toBe('GREEN');
    });

    it('classifies 30.00 as GREEN', () => {
      expect(classifyFCColour(new Decimal('30.00'))).toBe('GREEN');
    });

    it('classifies 30.01 as YELLOW', () => {
      expect(classifyFCColour(new Decimal('30.01'))).toBe('YELLOW');
    });

    it('classifies 33.00 as YELLOW', () => {
      expect(classifyFCColour(new Decimal('33.00'))).toBe('YELLOW');
    });

    it('classifies 33.01 as BLUE', () => {
      expect(classifyFCColour(new Decimal('33.01'))).toBe('BLUE');
    });
  });

  describe('CM1 Anomaly Boundaries (Section 14.1 table)', () => {
    // 61.99 -> Yes anomaly
    // 62.00 -> No anomaly (inclusive boundary)
    // 73.00 -> No anomaly (inclusive boundary)
    // 73.01 -> Yes anomaly
    const rev = new Decimal('100000');

    it('detects CM1 anomaly for 61.99%', () => {
      const anomalies = detectMarginAnomalies(new Decimal('61.99'), new Decimal('20.00'), rev);
      const cm1Anomaly = anomalies.find(a => a.metricKey === 'CM1');
      expect(cm1Anomaly).toBeDefined();
      expect(cm1Anomaly?.type).toBe('CM1_DEVIATION');
    });

    it('does NOT detect CM1 anomaly for 62.00% (inclusive boundary)', () => {
      const anomalies = detectMarginAnomalies(new Decimal('62.00'), new Decimal('20.00'), rev);
      const cm1Anomaly = anomalies.find(a => a.metricKey === 'CM1');
      expect(cm1Anomaly).toBeUndefined();
    });

    it('does NOT detect CM1 anomaly for 73.00% (inclusive boundary)', () => {
      const anomalies = detectMarginAnomalies(new Decimal('73.00'), new Decimal('20.00'), rev);
      const cm1Anomaly = anomalies.find(a => a.metricKey === 'CM1');
      expect(cm1Anomaly).toBeUndefined();
    });

    it('detects CM1 anomaly for 73.01%', () => {
      const anomalies = detectMarginAnomalies(new Decimal('73.01'), new Decimal('20.00'), rev);
      const cm1Anomaly = anomalies.find(a => a.metricKey === 'CM1');
      expect(cm1Anomaly).toBeDefined();
      expect(cm1Anomaly?.type).toBe('CM1_DEVIATION');
    });
  });

  describe('Cost-Line Breaches and Excess Cost Amount', () => {
    const revenue = new Decimal('100000.00');
    const targetSnapshot: TargetSnapshot = {
      MANPOWER: {
        metricKey: 'MANPOWER',
        minPct: '15.0000',
        maxPct: '20.0000',
        isFcSpecific: false
      }
    };

    it('identifies exact min and exact max as IN_RANGE', () => {
      // 15% of 100,000 = 15,000
      const atMin = evaluateCostLine('MANPOWER', new Decimal('15000'), revenue, targetSnapshot);
      expect(atMin.calculated.status).toBe('IN_RANGE');
      expect(atMin.anomaly).toBeNull();

      // 20% of 100,000 = 20,000
      const atMax = evaluateCostLine('MANPOWER', new Decimal('20000'), revenue, targetSnapshot);
      expect(atMax.calculated.status).toBe('IN_RANGE');
      expect(atMax.anomaly).toBeNull();
    });

    it('calculates ABOVE_MAX and excess amount correctly', () => {
      // 25% of 100,000 = 25,000. Target max is 20% (20,000). Excess = 5,000.
      const res = evaluateCostLine('MANPOWER', new Decimal('25000'), revenue, targetSnapshot);
      expect(res.calculated.status).toBe('ABOVE_MAX');
      expect(res.calculated.excessAmount).toBe('5000.00');
      expect(res.anomaly?.type).toBe('COST_ABOVE_MAX');
      expect(res.anomaly?.impactAmount).toBe('5000.00');
      expect(res.anomaly?.deviationPP).toBe('5.0000');
    });

    it('identifies BELOW_MIN without excess amount', () => {
      // 10% of 100,000 = 10,000. Target min is 15%.
      const res = evaluateCostLine('MANPOWER', new Decimal('10000'), revenue, targetSnapshot);
      expect(res.calculated.status).toBe('BELOW_MIN');
      expect(res.calculated.excessAmount).toBeNull();
      expect(res.anomaly?.type).toBe('COST_BELOW_MIN');
      expect(res.anomaly?.impactAmount).toBeNull();
    });

    it('handles TARGET_NOT_CONFIGURED gracefully', () => {
      const emptySnapshot: TargetSnapshot = {};
      const res = evaluateCostLine('MANPOWER', new Decimal('15000'), revenue, emptySnapshot);
      expect(res.calculated.status).toBe('TARGET_NOT_CONFIGURED');
      expect(res.anomaly).toBeNull();
    });
  });

  describe('Full PnL Integration & Special Scenarios', () => {
    const defaultSnapshot = resolveTargetSnapshot('FC-01', '2026-11-17', [], true);

    it('Scenario 1: Green FC with no cost anomalies', () => {
      const record: NormalizedFCRecord = {
        fcId: 'FC-GREEN',
        businessDate: '2026-11-17',
        currency: 'INR',
        revenue: '100000.00',
        manpowerCost: '18000.00', // 18% (target 15-20%) -> IN_RANGE
        packagingCost: '10000.00', // 10% (target 8-12%) -> IN_RANGE
        // CM1 = 100,000 - 28,000 = 72,000 (72% -> target band 65-70%, within 62-73% tolerance)
        powerFuelCost: '5000.00', // 5% (target 3-6%) -> IN_RANGE
        fcRent: '12000.00', // 12% (target 10-15%) -> IN_RANGE
        equipmentRentals: '3000.00', // 3% (target 2-5%) -> IN_RANGE
        overheads: '5000.00', // 5% (target 3-7%) -> IN_RANGE
        // CM2 = 72,000 - 25,000 = 47,000 -> 47% is > 33%! Wait, for Green CM2 must be 15-30%.
        // Let's adjust costs so CM2 is 25%:
        // CM2 needed: 25,000 (25%) -> Total remaining costs = 72,000 - 25,000 = 47,000
        sourceRowIndex: 2
      };

      // Let's configure costs to get CM2 between 15% and 30%:
      // Revenue = 100,000
      // Manpower: 18,000 (18%)
      // Packaging: 10,000 (10%)
      // CM1 = 72,000 (72%)
      // Power&Fuel: 5,000 (5%)
      // FC Rent: 14,000 (14%)
      // Equipment: 4,000 (4%)
      // Overheads: 25,000 ? Wait, overheads target is 3-7%.
      // Let's raise rent or manpower within targets:
      // Manpower: 20,000 (20%)
      // Packaging: 12,000 (12%)
      // CM1 = 68,000 (68%) -> in 65-70% band!
      // Power & Fuel: 5,000 (5%)
      // FC Rent: 14,000 (14%)
      // Equipment: 4,000 (4%)
      // Overheads: 6,000 (6%)
      // Sum other costs = 29,000
      // CM2 = 68,000 - 29,000 = 39,000 (39% -> > 33% is Blue)
      // To get CM2 in 15-30% range with standard 6 cost lines:
      // With targets: Manpower (15-20), Packaging (8-12), Power(3-6), Rent(10-15), Equip(2-5), Overheads(3-7)
      // Max cost sum = 20 + 12 + 6 + 15 + 5 + 7 = 65% of revenue
      // Min cost sum = 15 + 8 + 3 + 10 + 2 + 3 = 41% of revenue
      // If costs are 75% total, CM2 is 25% (GREEN).
      // Let's test with customized targets or standard costs:
      const greenTargets: TargetSnapshot = {
        MANPOWER: { metricKey: 'MANPOWER', minPct: '20', maxPct: '30', isFcSpecific: false },
        PACKAGING: { metricKey: 'PACKAGING', minPct: '5', maxPct: '15', isFcSpecific: false },
        POWER_AND_FUEL: { metricKey: 'POWER_AND_FUEL', minPct: '5', maxPct: '10', isFcSpecific: false },
        FC_RENT: { metricKey: 'FC_RENT', minPct: '10', maxPct: '20', isFcSpecific: false },
        EQUIPMENT_RENTALS: { metricKey: 'EQUIPMENT_RENTALS', minPct: '2', maxPct: '8', isFcSpecific: false },
        OVERHEADS: { metricKey: 'OVERHEADS', minPct: '5', maxPct: '15', isFcSpecific: false }
      };

      const greenRecord: NormalizedFCRecord = {
        fcId: 'FC-GREEN',
        businessDate: '2026-11-17',
        currency: 'INR',
        revenue: '100000.00',
        manpowerCost: '22000.00', // 22%
        packagingCost: '10000.00', // 10%
        // CM1 = 68,000 (68%) -> Within 65-70% band!
        powerFuelCost: '7000.00', // 7%
        fcRent: '15000.00', // 15%
        equipmentRentals: '5000.00', // 5%
        overheads: '9000.00', // 9%
        // Total costs: 22+10+7+15+5+9 = 68,000 -> CM2 = 32,000 (wait, 32% is Yellow: 30-33%)
        // Let's make overheads 12,000: Total other = 7+15+5+12 = 39,000 -> CM2 = 68,000 - 39,000 = 29,000 (29% -> GREEN!)
        sourceRowIndex: 2
      };
      greenRecord.overheads = '12000.00';

      const pnl = calculateDailyPnL(greenRecord, greenTargets);
      expect(pnl.cm1Pct).toBe('68.0000');
      expect(pnl.cm2Pct).toBe('29.0000');
      expect(pnl.colour).toBe('GREEN');
      expect(pnl.anomalies.length).toBe(0);
    });

    it('Scenario 2: Green FC with cost anomaly (Section 14.1 Requirement)', () => {
      // CM2 is in 15%-30% range, but one cost line is ABOVE_MAX
      const targets: TargetSnapshot = {
        MANPOWER: { metricKey: 'MANPOWER', minPct: '15', maxPct: '20', isFcSpecific: false },
        PACKAGING: { metricKey: 'PACKAGING', minPct: '5', maxPct: '15', isFcSpecific: false },
        POWER_AND_FUEL: { metricKey: 'POWER_AND_FUEL', minPct: '5', maxPct: '10', isFcSpecific: false },
        FC_RENT: { metricKey: 'FC_RENT', minPct: '10', maxPct: '20', isFcSpecific: false },
        EQUIPMENT_RENTALS: { metricKey: 'EQUIPMENT_RENTALS', minPct: '2', maxPct: '8', isFcSpecific: false },
        OVERHEADS: { metricKey: 'OVERHEADS', minPct: '5', maxPct: '15', isFcSpecific: false }
      };

      const record: NormalizedFCRecord = {
        fcId: 'FC-GREEN-ANOMALY',
        businessDate: '2026-11-17',
        currency: 'INR',
        revenue: '100000.00',
        manpowerCost: '25000.00', // 25% (ABOVE MAX 20%) -> Cost anomaly!
        packagingCost: '7000.00', // 7%
        // CM1 = 68,000 (68%) -> Within normal band
        powerFuelCost: '7000.00',
        fcRent: '15000.00',
        equipmentRentals: '5000.00',
        overheads: '12000.00',
        // CM2 = 29,000 (29%) -> GREEN
        sourceRowIndex: 3
      };

      const pnl = calculateDailyPnL(record, targets);
      expect(pnl.colour).toBe('GREEN');
      const manpowerAnomaly = pnl.anomalies.find(a => a.metricKey === 'MANPOWER');
      expect(manpowerAnomaly).toBeDefined();
      expect(manpowerAnomaly?.type).toBe('COST_ABOVE_MAX');
      expect(manpowerAnomaly?.impactAmount).toBe('5000.00');
    });

    it('Scenario 3: Red FC with multiple cost overruns', () => {
      const targets: TargetSnapshot = {
        MANPOWER: { metricKey: 'MANPOWER', minPct: '15', maxPct: '20', isFcSpecific: false },
        PACKAGING: { metricKey: 'PACKAGING', minPct: '5', maxPct: '10', isFcSpecific: false },
        POWER_AND_FUEL: { metricKey: 'POWER_AND_FUEL', minPct: '3', maxPct: '6', isFcSpecific: false },
        FC_RENT: { metricKey: 'FC_RENT', minPct: '10', maxPct: '15', isFcSpecific: false },
        EQUIPMENT_RENTALS: { metricKey: 'EQUIPMENT_RENTALS', minPct: '2', maxPct: '5', isFcSpecific: false },
        OVERHEADS: { metricKey: 'OVERHEADS', minPct: '3', maxPct: '7', isFcSpecific: false }
      };

      const record: NormalizedFCRecord = {
        fcId: 'FC-RED',
        businessDate: '2026-11-17',
        currency: 'INR',
        revenue: '100000.00',
        manpowerCost: '35000.00', // 35% (overrun 15k)
        packagingCost: '18000.00', // 18% (overrun 8k)
        // CM1 = 47,000 (47% -> Anomaly < 62%)
        powerFuelCost: '8000.00', // 8% (overrun 2k)
        fcRent: '16000.00', // 16% (overrun 1k)
        equipmentRentals: '5000.00',
        overheads: '10000.00', // 10% (overrun 3k)
        // CM2 = 47,000 - 39,000 = 8,000 (8% -> RED: < 12%)
        sourceRowIndex: 4
      };

      const pnl = calculateDailyPnL(record, targets);
      expect(pnl.colour).toBe('RED');
      expect(pnl.cm2Pct).toBe('8.0000');
      // Sorted by impact amount descending:
      const upperAnomalies = pnl.anomalies.filter(a => a.type === 'COST_ABOVE_MAX');
      expect(upperAnomalies[0]?.metricKey).toBe('MANPOWER');
      expect(upperAnomalies[0]?.impactAmount).toBe('15000.00');
      expect(upperAnomalies[1]?.metricKey).toBe('PACKAGING');
      expect(upperAnomalies[1]?.impactAmount).toBe('8000.00');
    });

    it('Scenario 4: Yellow FC inside tolerance envelope without CM2 anomaly', () => {
      // 12% <= CM2% < 15% is Yellow colour, but 12% to 15% is INSIDE the tolerance envelope (CM2 anomaly is < 12%)
      const targets: TargetSnapshot = {
        MANPOWER: { metricKey: 'MANPOWER', minPct: '15', maxPct: '30', isFcSpecific: false },
        PACKAGING: { metricKey: 'PACKAGING', minPct: '5', maxPct: '15', isFcSpecific: false },
        POWER_AND_FUEL: { metricKey: 'POWER_AND_FUEL', minPct: '5', maxPct: '10', isFcSpecific: false },
        FC_RENT: { metricKey: 'FC_RENT', minPct: '10', maxPct: '20', isFcSpecific: false },
        EQUIPMENT_RENTALS: { metricKey: 'EQUIPMENT_RENTALS', minPct: '2', maxPct: '8', isFcSpecific: false },
        OVERHEADS: { metricKey: 'OVERHEADS', minPct: '5', maxPct: '15', isFcSpecific: false }
      };

      const record: NormalizedFCRecord = {
        fcId: 'FC-YELLOW',
        businessDate: '2026-11-17',
        currency: 'INR',
        revenue: '100000.00',
        manpowerCost: '25000.00',
        packagingCost: '10000.00',
        // CM1 = 65,000 (65%)
        powerFuelCost: '9000.00',
        fcRent: '18000.00',
        equipmentRentals: '6000.00',
        overheads: '18000.00', // wait, 65,000 - 51,000 = 14,000 (14% CM2)
        sourceRowIndex: 5
      };

      const pnl = calculateDailyPnL(record, targets);
      expect(pnl.colour).toBe('YELLOW');
      expect(pnl.cm2Pct).toBe('14.0000');
      // No CM2 deviation anomaly because 14% is >= 12% tolerance boundary!
      const cm2Anomaly = pnl.anomalies.find(a => a.metricKey === 'CM2');
      expect(cm2Anomaly).toBeUndefined();
    });

    it('Scenario 5: Blue FC with suspicious high margin (> 33%)', () => {
      const targets: TargetSnapshot = {
        MANPOWER: { metricKey: 'MANPOWER', minPct: '15', maxPct: '25', isFcSpecific: false },
        PACKAGING: { metricKey: 'PACKAGING', minPct: '5', maxPct: '15', isFcSpecific: false },
        POWER_AND_FUEL: { metricKey: 'POWER_AND_FUEL', minPct: '5', maxPct: '10', isFcSpecific: false },
        FC_RENT: { metricKey: 'FC_RENT', minPct: '10', maxPct: '20', isFcSpecific: false },
        EQUIPMENT_RENTALS: { metricKey: 'EQUIPMENT_RENTALS', minPct: '2', maxPct: '8', isFcSpecific: false },
        OVERHEADS: { metricKey: 'OVERHEADS', minPct: '5', maxPct: '15', isFcSpecific: false }
      };

      const record: NormalizedFCRecord = {
        fcId: 'FC-BLUE',
        businessDate: '2026-11-17',
        currency: 'INR',
        revenue: '100000.00',
        manpowerCost: '16000.00',
        packagingCost: '8000.00',
        // CM1 = 76,000 (76%) -> CM1 > 73%
        powerFuelCost: '6000.00',
        fcRent: '12000.00',
        equipmentRentals: '3000.00',
        overheads: '5000.00',
        // CM2 = 76,000 - 26,000 = 50,000 (50% CM2 > 33%)
        sourceRowIndex: 6
      };

      const pnl = calculateDailyPnL(record, targets);
      expect(pnl.colour).toBe('BLUE');
      expect(pnl.cm2Pct).toBe('50.0000');
      const suspicious = pnl.anomalies.find(a => a.type === 'SUSPICIOUS_HIGH_MARGIN');
      expect(suspicious).toBeDefined();
    });
  });

  describe('Weighted Aggregate Multi-FC Calculations', () => {
    it('calculates weighted CM1% and CM2% accurately without simple averaging', () => {
      // FC1: Revenue 100, CM1 60 (60%), CM2 20 (20%)
      // FC2: Revenue 900, CM1 720 (80%), CM2 270 (30%)
      // Simple average of CM1: (60 + 80) / 2 = 70%
      // Weighted CM1: (60 + 720) / (100 + 900) = 780 / 1000 = 78.00%
      // Weighted CM2: (20 + 270) / (100 + 900) = 290 / 1000 = 29.00%
      const aggregates = calculateWeightedAggregates([
        { revenue: '100', cm1: '60', cm2: '20' },
        { revenue: '900', cm1: '720', cm2: '270' }
      ]);

      expect(aggregates.totalRevenue).toBe('1000.00');
      expect(aggregates.weightedCM1Pct).toBe('78.0000');
      expect(aggregates.weightedCM2Pct).toBe('29.0000');
    });
  });
});
