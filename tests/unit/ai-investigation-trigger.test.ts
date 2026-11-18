import { describe, it, expect } from 'vitest';
import { evaluateDataCompleteness } from '@prozo/finance';

describe('AI Investigation 3-Dataset Upload Requirement Tests', () => {
  const fcId = 'fc-test-01';
  const businessDate = '2026-11-20';

  it('rejects AI investigation readiness when only Financial P&L is uploaded (1/3 files)', () => {
    const evaluation = evaluateDataCompleteness({
      fcId,
      businessDate,
      hasPnl: true,
      hasOperations: false,
      hasLabor: false,
      pnlVersion: 1
    });

    expect(evaluation.completeness).toBe('FINANCIAL_ONLY');
    expect(evaluation.diagnosticStatus).toBe('PARTIAL');

    const canTrigger = evaluation.hasPnl && evaluation.hasOperations && evaluation.hasLabor;
    expect(canTrigger).toBe(false);

    const missingFiles: string[] = [];
    if (!evaluation.hasPnl) missingFiles.push('Financial P&L');
    if (!evaluation.hasOperations) missingFiles.push('Daily Operations');
    if (!evaluation.hasLabor) missingFiles.push('Daily Labor');

    expect(missingFiles).toEqual(['Daily Operations', 'Daily Labor']);
  });

  it('rejects AI investigation readiness when P&L and Operations are uploaded, but Labor is missing (2/3 files)', () => {
    const evaluation = evaluateDataCompleteness({
      fcId,
      businessDate,
      hasPnl: true,
      hasOperations: true,
      hasLabor: false,
      pnlVersion: 1,
      operationsVersion: 1
    });

    expect(evaluation.completeness).toBe('PENDING_LABOR');
    expect(evaluation.diagnosticStatus).toBe('PARTIAL');

    const canTrigger = evaluation.hasPnl && evaluation.hasOperations && evaluation.hasLabor;
    expect(canTrigger).toBe(false);

    const missingFiles: string[] = [];
    if (!evaluation.hasPnl) missingFiles.push('Financial P&L');
    if (!evaluation.hasOperations) missingFiles.push('Daily Operations');
    if (!evaluation.hasLabor) missingFiles.push('Daily Labor');

    expect(missingFiles).toEqual(['Daily Labor']);
  });

  it('rejects AI investigation readiness when P&L and Labor are uploaded, but Operations is missing (2/3 files)', () => {
    const evaluation = evaluateDataCompleteness({
      fcId,
      businessDate,
      hasPnl: true,
      hasOperations: false,
      hasLabor: true,
      pnlVersion: 1,
      laborVersion: 1
    });

    expect(evaluation.completeness).toBe('PENDING_OPERATIONS');
    expect(evaluation.diagnosticStatus).toBe('PARTIAL');

    const canTrigger = evaluation.hasPnl && evaluation.hasOperations && evaluation.hasLabor;
    expect(canTrigger).toBe(false);

    const missingFiles: string[] = [];
    if (!evaluation.hasPnl) missingFiles.push('Financial P&L');
    if (!evaluation.hasOperations) missingFiles.push('Daily Operations');
    if (!evaluation.hasLabor) missingFiles.push('Daily Labor');

    expect(missingFiles).toEqual(['Daily Operations']);
  });

  it('rejects AI investigation readiness when Operations and Labor are uploaded, but P&L is missing (2/3 files)', () => {
    const evaluation = evaluateDataCompleteness({
      fcId,
      businessDate,
      hasPnl: false,
      hasOperations: true,
      hasLabor: true,
      operationsVersion: 1,
      laborVersion: 1
    });

    expect(evaluation.completeness).toBe('PARTIAL');
    expect(evaluation.diagnosticStatus).toBe('INSUFFICIENT_DATA');

    const canTrigger = evaluation.hasPnl && evaluation.hasOperations && evaluation.hasLabor;
    expect(canTrigger).toBe(false);
  });

  it('allows AI investigation trigger ONLY when all 3 files are uploaded (3/3 files: P&L, Operations, Labor)', () => {
    const evaluation = evaluateDataCompleteness({
      fcId,
      businessDate,
      hasPnl: true,
      hasOperations: true,
      hasLabor: true,
      pnlVersion: 1,
      operationsVersion: 1,
      laborVersion: 1
    });

    expect(evaluation.completeness).toBe('COMPLETE');
    expect(evaluation.diagnosticStatus).toBe('COMPLETE');

    const canTrigger = evaluation.hasPnl && evaluation.hasOperations && evaluation.hasLabor;
    expect(canTrigger).toBe(true);

    const missingFiles: string[] = [];
    if (!evaluation.hasPnl) missingFiles.push('Financial P&L');
    if (!evaluation.hasOperations) missingFiles.push('Daily Operations');
    if (!evaluation.hasLabor) missingFiles.push('Daily Labor');

    expect(missingFiles).toHaveLength(0);
  });

  it('formats comprehensive AI input payload with all required operational, workforce, and financial facts', () => {
    const mockInputPayload = {
      fcId: 'FC-DEL-01',
      businessDate: '2026-11-20',
      dataCompleteness: {
        completeness: 'COMPLETE',
        diagnosticStatus: 'COMPLETE',
        hasPnl: true,
        hasOperations: true,
        hasLabor: true
      },
      financialFacts: {
        revenue: '100000',
        currency: 'INR',
        cm1: '68000',
        cm1Pct: '68.00',
        cm2: '24000',
        cm2Pct: '24.00',
        colour: 'RED',
        manpowerCost: '32000',
        costLines: [
          {
            lineItem: 'MANPOWER',
            amount: '32000',
            percentage: '32.00',
            targetMinPct: '15.00',
            targetMaxPct: '20.00',
            status: 'ABOVE_MAX',
            excessAmount: '12000'
          }
        ],
        costContributors: [
          {
            lineItem: 'MANPOWER',
            amount: '32000',
            percentage: '32.00',
            status: 'ABOVE_MAX',
            excessAmount: '12000'
          }
        ]
      },
      operationsData: {
        inboundShipments: 40,
        outboundOrders: 1200,
        unitsProcessed: 4800,
        operatingHours: 16,
        storageOccupancyPct: 85
      },
      laborData: {
        plannedHeadcount: 25,
        actualHeadcount: 24,
        plannedLabourHours: 200,
        actualPaidHours: 240,
        productiveHours: 180,
        overtimeHours: 40,
        contractorHeadcount: 6,
        contractorHours: 48,
        contractorCost: '12000'
      },
      derivedMetrics: {
        operational: { unitsPerOrder: 4, throughputPerHour: 300 },
        workforce: { labourUtilization: 75, overtimeRatio: 16.67 },
        productivity: { costPerOrder: 26.67, unitsPerPaidHour: 20 }
      },
      anomalies: [
        {
          metricKey: 'MANPOWER',
          type: 'COST_SPIKE',
          actualPct: '32.00',
          targetMaxPct: '20.00',
          deviationPP: '12.00',
          impactAmount: '12000',
          severity: 'HIGH',
          description: 'Manpower cost exceeded target maximum'
        }
      ]
    };

    expect(mockInputPayload.fcId).toBe('FC-DEL-01');
    expect(mockInputPayload.dataCompleteness.completeness).toBe('COMPLETE');
    expect(mockInputPayload.financialFacts.costContributors).toHaveLength(1);
    expect(mockInputPayload.operationsData.outboundOrders).toBe(1200);
    expect(mockInputPayload.laborData.overtimeHours).toBe(40);
    expect(mockInputPayload.derivedMetrics.workforce.labourUtilization).toBe(75);
    expect(mockInputPayload.anomalies).toHaveLength(1);

    const jsonString = JSON.stringify(mockInputPayload, null, 2);
    expect(jsonString).toContain('"fcId": "FC-DEL-01"');
    expect(jsonString).toContain('"outboundOrders": 1200');
    expect(jsonString).toContain('"labourUtilization": 75');
  });
});
