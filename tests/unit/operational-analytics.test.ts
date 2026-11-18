import { describe, it, expect } from 'vitest';
import {
  calculateOperationalMetrics,
  calculateWorkforceMetrics,
  calculateProductivityMetrics,
  reconcileContractorCosts,
  compareMetricToHistorical,
  buildMultiWindowComparisons,
  evaluateDataCompleteness,
  generateInputFingerprint
} from '../../packages/finance/src/index.js';
import { DailyOperationsInput, DailyLaborInput } from '@prozo/shared';

describe('Operational & Workforce Analytics Services Unit Tests', () => {
  const sampleOps: DailyOperationsInput = {
    fcId: 'FC-DEL-01',
    businessDate: '2026-11-20',
    inboundShipments: 50,
    outboundOrders: 1500,
    unitsProcessed: 6000,
    orderLinesProcessed: 3750,
    returnsProcessed: 45,
    operatingHours: 15,
    storageOccupancyPct: 80
  };

  const sampleLabor: DailyLaborInput = {
    fcId: 'FC-DEL-01',
    businessDate: '2026-11-20',
    plannedHeadcount: 30,
    actualHeadcount: 28,
    plannedLabourHours: 240,
    actualPaidHours: 250,
    productiveHours: 215,
    overtimeHours: 25,
    contractorHeadcount: 8,
    contractorHours: 60,
    contractorCost: '18000.00'
  };

  describe('Operational Analytics Calculations', () => {
    it('computes derived throughput metrics accurately', () => {
      const derived = calculateOperationalMetrics(sampleOps);

      expect(derived.unitsPerOrder).toBe(4); // 6000 / 1500
      expect(derived.averageOrderLines).toBe(2.5); // 3750 / 1500
      expect(derived.ordersPerOperatingHour).toBe(100); // 1500 / 15
      expect(derived.returnsRate).toBe(3); // (45 / 1500) * 100 = 3%
    });

    it('protects against zero denominators (returns 0 or null, never NaN or Infinity)', () => {
      const zeroOps: DailyOperationsInput = {
        fcId: 'FC-ZERO-01',
        businessDate: '2026-11-20',
        inboundShipments: 0,
        outboundOrders: 0,
        unitsProcessed: 0,
        orderLinesProcessed: 0,
        returnsProcessed: 0,
        operatingHours: 0,
        storageOccupancyPct: null
      };

      const derived = calculateOperationalMetrics(zeroOps);
      expect(derived.unitsPerOrder).toBeNull();
      expect(derived.averageOrderLines).toBeNull();
      expect(derived.ordersPerOperatingHour).toBeNull();
      expect(derived.returnsRate).toBeNull();
    });
  });

  describe('Workforce Analytics Calculations', () => {
    it('computes workforce utilization, overtime, and unit labor productivity', () => {
      const derived = calculateWorkforceMetrics(sampleLabor, sampleOps);

      expect(derived.labourUtilization).toBe(86); // (215 / 250) * 100 = 86%
      expect(derived.overtimeRatio).toBe(10); // (25 / 250) * 100 = 10%
      expect(derived.contractorHourShare).toBe(24); // (60 / 250) * 100 = 24%
      expect(derived.actualVsPlannedLabourHours).toBeCloseTo(104.1667, 2); // (250 / 240) * 100
      expect(derived.ordersPerPaidLabourHour).toBe(6); // 1500 / 250
      expect(derived.unitsPerProductiveLabourHour).toBeCloseTo(27.907, 2); // 6000 / 215
    });

    it('safely handles zero-hour scenarios without crashing', () => {
      const zeroLabor: DailyLaborInput = {
        fcId: 'FC-ZERO-02',
        businessDate: '2026-11-20',
        plannedHeadcount: 0,
        actualHeadcount: 0,
        plannedLabourHours: 0,
        actualPaidHours: 0,
        productiveHours: 0,
        overtimeHours: 0,
        contractorHeadcount: 0,
        contractorHours: 0,
        contractorCost: '0'
      };

      const derived = calculateWorkforceMetrics(zeroLabor, null);
      expect(derived.labourUtilization).toBeNull();
      expect(derived.overtimeRatio).toBeNull();
      expect(derived.contractorHourShare).toBeNull();
      expect(derived.ordersPerPaidLabourHour).toBeNull();
      expect(derived.unitsPerProductiveLabourHour).toBeNull();
    });
  });

  describe('Productivity & Contractor Reconciliation', () => {
    it('computes unit manpower cost economics', () => {
      const productivity = calculateProductivityMetrics('45000.00', sampleOps, sampleLabor);

      expect(productivity.manpowerCostPerOrder).toBe(30); // 45000 / 1500
      expect(productivity.manpowerCostPerPaidHour).toBe(180); // 45000 / 250
      expect(productivity.contractorCostShareOfManpower).toBe(40); // (18000 / 45000) * 100 = 40%
    });

    it('does not flag normal contractor cost ratio', () => {
      const recon = reconcileContractorCosts('50000.00', '15000.00'); // 30%
      expect(recon.hasDiscrepancy).toBe(false);
      expect(recon.contractorCostSharePct).toBe(30);
    });

    it('flags contractor cost exceeding reported total manpower cost (impossible double-count or misclassification)', () => {
      const recon = reconcileContractorCosts('20000.00', '25000.00'); // 125%
      expect(recon.hasDiscrepancy).toBe(true);
      expect(recon.discrepancyType).toBe('EXCEEDS_TOTAL_MANPOWER');
      expect(recon.description).toMatch(/exceeds total reported P&L manpower cost/);
    });

    it('flags unusually high contractor cost share (> 75%)', () => {
      const recon = reconcileContractorCosts('30000.00', '27000.00'); // 90%
      expect(recon.hasDiscrepancy).toBe(true);
      expect(recon.discrepancyType).toBe('UNUSUALLY_HIGH_SHARE');
      expect(recon.description).toMatch(/Heavy reliance on temporary staffing/);
    });
  });

  describe('Historical Baseline Comparisons', () => {
    const historicalPoints = [
      { businessDate: '2026-11-19', value: 95 },
      { businessDate: '2026-11-18', value: 100 },
      { businessDate: '2026-11-17', value: 105 },
      { businessDate: '2026-11-16', value: 98 },
      { businessDate: '2026-11-15', value: 102 }
    ];

    it('calculates baseline comparison against historical window', () => {
      const comparison = compareMetricToHistorical(
        'manpowerCost',
        125,
        historicalPoints,
        'INR',
        { targetBusinessDate: '2026-11-20', windowDays: 7 }
      );

      expect(comparison.sampleSize).toBe(5);
      expect(comparison.baselineValue).toBe(100);
      expect(comparison.absoluteChange).toBe(25);
      expect(comparison.percentageChange).toBe(25);
    });

    it('handles empty baseline gracefully', () => {
      const comparison = compareMetricToHistorical(
        'unitsProcessed',
        100,
        [],
        'units',
        { targetBusinessDate: '2026-11-20', windowDays: 7 }
      );

      expect(comparison.sampleSize).toBe(0);
      expect(comparison.baselineValue).toBeNull();
      expect(comparison.absoluteChange).toBeNull();
      expect(comparison.percentageChange).toBeNull();
    });

    it('builds standard multi-window comparisons (7d, 30d, 90d, weekdayComparable)', () => {
      const comparisons = buildMultiWindowComparisons(
        'outboundOrders',
        1500,
        historicalPoints,
        'orders',
        '2026-11-20'
      );

      expect(comparisons.sevenDay).toBeDefined();
      expect(comparisons.thirtyDay).toBeDefined();
      expect(comparisons.ninetyDay).toBeDefined();
      expect(comparisons.weekdayComparable).toBeDefined();
      expect(comparisons.sevenDay.metric).toBe('outboundOrders');
    });
  });

  describe('Data Completeness Service', () => {
    const fcId = 'FC-DEL-01';
    const businessDate = '2026-11-20';

    it('evaluates COMPLETE when P&L, Operations and Labor all exist', () => {
      const res = evaluateDataCompleteness({ fcId, businessDate, hasPnl: true, hasOperations: true, hasLabor: true });
      expect(res.completeness).toBe('COMPLETE');
      expect(res.diagnosticStatus).toBe('COMPLETE');
    });

    it('evaluates FINANCIAL_ONLY when only P&L is available', () => {
      const res = evaluateDataCompleteness({ fcId, businessDate, hasPnl: true, hasOperations: false, hasLabor: false });
      expect(res.completeness).toBe('FINANCIAL_ONLY');
      expect(res.diagnosticStatus).toBe('PARTIAL');
    });

    it('evaluates PENDING_LABOR when P&L and Operations exist but Labor is missing', () => {
      const res = evaluateDataCompleteness({ fcId, businessDate, hasPnl: true, hasOperations: true, hasLabor: false });
      expect(res.completeness).toBe('PENDING_LABOR');
      expect(res.diagnosticStatus).toBe('PARTIAL');
    });

    it('evaluates PENDING_OPERATIONS when P&L and Labor exist but Operations is missing', () => {
      const res = evaluateDataCompleteness({ fcId, businessDate, hasPnl: true, hasOperations: false, hasLabor: true });
      expect(res.completeness).toBe('PENDING_OPERATIONS');
      expect(res.diagnosticStatus).toBe('PARTIAL');
    });

    it('evaluates PARTIAL when operational datasets exist without P&L', () => {
      const res = evaluateDataCompleteness({ fcId, businessDate, hasPnl: false, hasOperations: true, hasLabor: true });
      expect(res.completeness).toBe('PARTIAL');
      expect(res.diagnosticStatus).toBe('INSUFFICIENT_DATA');
    });

    it('evaluates INSUFFICIENT_DATA when nothing is present', () => {
      const res = evaluateDataCompleteness({ fcId, businessDate, hasPnl: false, hasOperations: false, hasLabor: false });
      expect(res.completeness).toBe('INSUFFICIENT_DATA');
      expect(res.diagnosticStatus).toBe('INSUFFICIENT_DATA');
    });

    it('generates consistent and idempotent input fingerprints', () => {
      const fp1 = generateInputFingerprint({
        fcId,
        businessDate,
        pnlVersion: 1,
        operationsVersion: 1,
        laborVersion: 1,
        model: 'gemini-1.5-pro',
        promptVersion: 'v2.0'
      });

      const fp2 = generateInputFingerprint({
        fcId,
        businessDate,
        pnlVersion: 1,
        operationsVersion: 1,
        laborVersion: 1,
        model: 'gemini-1.5-pro',
        promptVersion: 'v2.0'
      });

      const fp3 = generateInputFingerprint({
        fcId,
        businessDate,
        pnlVersion: 1,
        operationsVersion: 2, // Ops updated to v2
        laborVersion: 1,
        model: 'gemini-1.5-pro',
        promptVersion: 'v2.0'
      });

      expect(fp1).toBe(fp2);
      expect(fp1).not.toBe(fp3);
    });
  });
});
