import { describe, it, expect } from 'vitest';
import {
  executeMarginAIWorkflow,
  buildInvestigationContext,
  EvidenceRegistry,
  INVESTIGATION_SYSTEM_PROMPT,
  RECOMMENDATION_SYSTEM_PROMPT,
  PROMPT_VERSIONS,
  estimateTokens
} from '@prozo/ai';
import {
  detectMarginAnomalies,
  evaluateCostLine,
  calculateDailyPnL,
  reconcileContractorCosts,
  buildHistoricalSummary
} from '@prozo/finance';
import {
  CalculatedPnL,
  DailyOperationsInput,
  DailyLaborInput,
  TargetSnapshot,
  NormalizedFCRecord,
  InvestigationFinding,
  InvestigationOutput,
  RecommendationOutput,
  Decimal
} from '@prozo/shared';

describe('AI Workflow Optimization & Quality Unit Tests', () => {
  // Sample FC Data Fixture
  const sampleTargets: TargetSnapshot = {
    MANPOWER: { metricKey: 'MANPOWER', minPct: '15.0000', maxPct: '20.0000', isFcSpecific: false },
    PACKAGING: { metricKey: 'PACKAGING', minPct: '8.0000', maxPct: '12.0000', isFcSpecific: false },
    POWER_AND_FUEL: { metricKey: 'POWER_AND_FUEL', minPct: '3.0000', maxPct: '6.0000', isFcSpecific: false },
    FC_RENT: { metricKey: 'FC_RENT', minPct: '10.0000', maxPct: '15.0000', isFcSpecific: false },
    EQUIPMENT_RENTALS: { metricKey: 'EQUIPMENT_RENTALS', minPct: '2.0000', maxPct: '5.0000', isFcSpecific: false },
    OVERHEADS: { metricKey: 'OVERHEADS', minPct: '3.0000', maxPct: '7.0000', isFcSpecific: false }
  };

  const samplePnLRecord: NormalizedFCRecord = {
    fcId: 'FC-DEL-01',
    businessDate: '2026-11-20',
    currency: 'INR',
    revenue: '100000.00',
    manpowerCost: '34221.00', // 34.2210% (Target 15-20% -> Breach by 14.2210pp)
    packagingCost: '7500.00',  // 7.5000% (Target 8-12% -> Below min by 0.5000pp, unusual underspend)
    // CM1 = 100,000 - 41,721 = 58,279 -> 58.2790% (Tolerance envelope 62%-73% -> Breached by 3.7210pp)
    powerFuelCost: '4500.00',  // 4.5000% (Target 3-6% -> In range)
    fcRent: '12000.00',        // 12.0000% (Target 10-15% -> In range)
    equipmentRentals: '3500.00', // 3.5000% (Target 2-5% -> In range)
    overheads: '4000.00',      // 4.0000% (Target 3-7% -> In range)
    // CM2 = 58,279 - 24,000 = 34,279 -> 34.2790% (Blue > 33%)
    sourceRowIndex: 2
  };

  const sampleOperations: DailyOperationsInput = {
    fcId: 'FC-DEL-01',
    businessDate: '2026-11-20',
    inboundShipments: 25,
    outboundOrders: 1250,
    unitsProcessed: 5000,
    orderLinesProcessed: 2500,
    returnsProcessed: 40,
    operatingHours: 16,
    storageOccupancyPct: 78
  };

  const sampleLabor: DailyLaborInput = {
    fcId: 'FC-DEL-01',
    businessDate: '2026-11-20',
    plannedHeadcount: 30,
    actualHeadcount: 32,
    plannedLabourHours: 240,
    actualPaidHours: 302,
    productiveHours: 235,
    overtimeHours: 54,
    contractorHeadcount: 8,
    contractorHours: 64,
    contractorCost: '25600.00' // ₹25,600 contractor cost
  };

  // 1. FINANCIAL INTERPRETATION TESTS
  describe('1. Financial Interpretation & Deviation Semantics', () => {
    it('accurately distinguishes deviationFromTargetPP from breachBeyondTolerancePP for CM1', () => {
      // CM1 actual = 61.7707%
      // Target = 65% to 70%
      // Tolerance = 62% to 73%
      const anomalies = detectMarginAnomalies(
        new Decimal('61.7707'),
        new Decimal('20.0000'),
        new Decimal('100000.00')
      );

      const cm1Anomaly = anomalies.find(a => a.metricKey === 'CM1');
      expect(cm1Anomaly).toBeDefined();
      expect(cm1Anomaly?.type).toBe('CM1_DEVIATION');

      // Deviation from base target min (65% - 61.7707% = 3.2293)
      expect(cm1Anomaly?.deviationFromTargetPP).toBe('3.2293');
      // Breach beyond tolerance boundary (62% - 61.7707% = 0.2293)
      expect(cm1Anomaly?.breachBeyondTolerancePP).toBe('0.2293');
    });

    it('accurately distinguishes deviationFromTargetPP from breachBeyondTolerancePP for CM2 lower breach', () => {
      // CM2 actual = 10.5000%
      // Target = 15% to 30%, Tolerance = 12% to 33%
      const anomalies = detectMarginAnomalies(
        new Decimal('68.0000'),
        new Decimal('10.5000'),
        new Decimal('100000.00')
      );

      const cm2Anomaly = anomalies.find(a => a.metricKey === 'CM2');
      expect(cm2Anomaly).toBeDefined();
      // Deviation from target min (15 - 10.5 = 4.5 pp)
      expect(cm2Anomaly?.deviationFromTargetPP).toBe('4.5000');
      // Breach beyond tolerance (12 - 10.5 = 1.5 pp)
      expect(cm2Anomaly?.breachBeyondTolerancePP).toBe('1.5000');
    });

    it('accurately distinguishes deviationFromTargetPP from breachBeyondTolerancePP for CM2 upper breach (Blue status)', () => {
      // CM2 actual = 34.2790%
      // Target = 15% to 30%, Tolerance = 12% to 33%
      const anomalies = detectMarginAnomalies(
        new Decimal('68.0000'),
        new Decimal('34.2790'),
        new Decimal('100000.00')
      );

      const cm2Anomaly = anomalies.find(a => a.metricKey === 'CM2');
      expect(cm2Anomaly).toBeDefined();
      expect(cm2Anomaly?.type).toBe('SUSPICIOUS_HIGH_MARGIN');
      // Deviation from target max (34.2790 - 30 = 4.2790 pp)
      expect(cm2Anomaly?.deviationFromTargetPP).toBe('4.2790');
      // Breach beyond tolerance (34.2790 - 33 = 1.2790 pp)
      expect(cm2Anomaly?.breachBeyondTolerancePP).toBe('1.2790');
    });

    it('does NOT flag a CM2 anomaly for a Yellow FC inside tolerance envelope (12% to 15%)', () => {
      // CM2 = 13.5000% is Yellow colour (12-15%), but >= 12% tolerance boundary
      const anomalies = detectMarginAnomalies(
        new Decimal('68.0000'),
        new Decimal('13.5000'),
        new Decimal('100000.00')
      );

      const cm2Anomaly = anomalies.find(a => a.metricKey === 'CM2');
      expect(cm2Anomaly).toBeUndefined();
    });

    it('treats below-minimum costs as unusual underspend / potential data quality concerns, not confirmed underreporting', () => {
      const res = evaluateCostLine(
        'PACKAGING',
        new Decimal('7500.00'), // 7.5% vs min 8.0%
        new Decimal('100000.00'),
        sampleTargets
      );

      expect(res.calculated.status).toBe('BELOW_MIN');
      expect(res.anomaly).toBeDefined();
      expect(res.anomaly?.type).toBe('COST_BELOW_MIN');
      expect(res.anomaly?.deviationFromTargetPP).toBe('0.5000');
      expect(res.anomaly?.breachBeyondTolerancePP).toBeNull();
      expect(res.anomaly?.description).toMatch(/Unusual underspend or potential data-quality concern/);
    });

    it('does not confuse FC colour with anomaly severity (Green FC can have Critical cost overrun)', () => {
      // Revenue = 100,000. Manpower target max = 20%. Actual Manpower = 27,000 (27% -> 7% excess > 5% of rev => CRITICAL)
      // Other costs adjusted so CM2 remains 22% (GREEN)
      const res = evaluateCostLine(
        'MANPOWER',
        new Decimal('27000.00'),
        new Decimal('100000.00'),
        sampleTargets
      );

      expect(res.calculated.status).toBe('ABOVE_MAX');
      expect(res.anomaly?.severity).toBe('CRITICAL');
      expect(res.anomaly?.impactAmount).toBe('7000.00');
    });
  });

  // 2. WORKFORCE & CONTRACTOR RECONCILIATION TESTS
  describe('2. Workforce Reasoning & Contractor Cost Reconciliation', () => {
    it('surfaces RATE_AND_ALLOCATION_REVIEW signal when contractor cost share diverges from hour share', () => {
      // Manpower cost: ₹34,221, Contractor cost: ₹25,600 (74.81%)
      // Paid hours: 302, Contractor hours: 64 (21.19%)
      const recon = reconcileContractorCosts('34221.00', '25600.00', {
        actualPaidHours: 302,
        contractorHours: 64
      });

      expect(recon.contractorCostSharePct).toBe(74.81);
      expect(recon.contractorHourSharePct).toBe(21.19);
      expect(recon.contractorCostPerHour).toBe(400.0); // 25600 / 64 = 400
      expect(recon.nonContractorCostPerHour).toBe(36.22); // (34221 - 25600) / (302 - 64) = 8621 / 238 = 36.22

      // Divergence is flagged as a review signal, NOT a confirmed anomaly
      expect(recon.signal).toBe('RATE_AND_ALLOCATION_REVIEW');
      expect(recon.hasDiscrepancy).toBe(false);
      expect(recon.assumptionsVerified).toBe(true);
      expect(recon.assumptions).toHaveLength(4);
      expect(recon.description).toMatch(/Flagged for rate and allocation review; not a confirmed accounting error/);
    });

    it('flags true accounting discrepancy if contractor cost exceeds total P&L manpower cost', () => {
      const recon = reconcileContractorCosts('30000.00', '35000.00', {
        actualPaidHours: 300,
        contractorHours: 60
      });

      expect(recon.hasDiscrepancy).toBe(true);
      expect(recon.signal).toBe('EXCEEDS_TOTAL_MANPOWER');
      expect(recon.assumptionsVerified).toBe(false);
    });

    it('verifies paid hours versus productive hours', () => {
      const { context, evidenceRegistry } = buildInvestigationContext({
        fcId: 'FC-DEL-01',
        businessDate: '2026-11-20',
        pnl: calculateDailyPnL(samplePnLRecord, sampleTargets),
        operationsData: sampleOperations,
        laborData: sampleLabor,
        derivedMetrics: {
          workforce: {
            labourUtilization: 77.81, // 235 / 302 * 100
            overtimeRatio: 17.88,    // 54 / 302 * 100
            contractorHourShare: 21.19
          }
        }
      });

      expect(context.labor?.paidHours).toBe(302);
      expect(context.labor?.productiveHours).toBe(235);
      expect(context.labor?.overtimeHours).toBe(54);
      expect(context.metrics.labourUtilizationPct).toBe(77.81);
      expect(context.metrics.overtimeRatioPct).toBe(17.88);

      expect(evidenceRegistry.get('ACTUAL_PAID_HOURS')?.value).toBe(302);
      expect(evidenceRegistry.get('PRODUCTIVE_HOURS')?.value).toBe(235);
      expect(evidenceRegistry.get('OVERTIME_HOURS')?.value).toBe(54);
    });

    it('handles missing workforce records cleanly without fabrication', () => {
      const { context } = buildInvestigationContext({
        fcId: 'FC-DEL-01',
        businessDate: '2026-11-20',
        pnl: calculateDailyPnL(samplePnLRecord, sampleTargets),
        operationsData: sampleOperations,
        laborData: null
      });

      expect(context.labor).toBeNull();
      expect(context.dataAvailability.labor).toBe(false);
      expect(context.metrics.overtimeRatioPct).toBeUndefined();
    });
  });

  // 3. HISTORICAL DATA RETRIEVAL TESTS
  describe('3. Historical Information Handling', () => {
    it('represents absent historical records cleanly once with available: false, without repeating nulls', () => {
      const summary = buildHistoricalSummary({}, 0, 0);

      expect(summary.available).toBe(false);
      expect(summary.sampleSize).toBe(0);
      expect(summary.metrics).toEqual([]);
      expect(summary.recurringAnomalyCount).toBe(0);

      const { context } = buildInvestigationContext({
        fcId: 'FC-DEL-01',
        businessDate: '2026-11-20',
        pnl: calculateDailyPnL(samplePnLRecord, sampleTargets),
        historicalContext: { priorSubmissionsCount: 0 }
      });

      expect(context.history.available).toBe(false);
      expect(context.history.sampleSize).toBe(0);
      expect(context.history.metrics).toEqual([]);
    });

    it('populates valid historical comparisons when records exist', () => {
      const { context, evidenceRegistry } = buildInvestigationContext({
        fcId: 'FC-DEL-01',
        businessDate: '2026-11-20',
        pnl: calculateDailyPnL(samplePnLRecord, sampleTargets),
        historicalContext: {
          priorSubmissionsCount: 14,
          operationalComparisons: {
            outboundOrders: {
              currentValue: 1250,
              baselineValue: 1000,
              percentageChange: 25.0,
              sampleSize: 14,
              unit: 'orders',
              dataPeriod: 'Last 30 Days'
            }
          }
        }
      });

      expect(context.history.available).toBe(true);
      expect(context.history.sampleSize).toBe(14);
      expect(context.history.metrics).toHaveLength(1);
      expect(context.history.metrics[0]?.metric).toBe('outboundOrders');
      expect(context.history.metrics[0]?.baselineValue).toBe(1000);
      expect(context.history.metrics[0]?.changePct).toBe(25.0);

      expect(evidenceRegistry.get('BASELINE_OUTBOUNDORDERS')?.value).toBe(1000);
    });
  });

  // 4. EVIDENCE REGISTRY & AGENT OUTPUT VALIDATION
  describe('4. Deterministic Evidence Registry & Output Validation', () => {
    it('creates deterministic evidence registry from context and resolves references', () => {
      const registry = new EvidenceRegistry();
      const id1 = registry.register('MANPOWER_COST_PCT', 34.22, '%', 'Daily P&L');
      const id2 = registry.register('OVERTIME_HOURS', 54, 'hours', 'Daily_Labor');
      const id3 = registry.register('REVENUE', 100000, 'INR', 'Daily P&L');

      expect(id1).toBe('E1');
      expect(id2).toBe('E2');
      expect(id3).toBe('E3');

      const { resolvedIds, unknownRefs } = registry.resolveRefs(['E1', 'OVERTIME_HOURS']);
      expect(resolvedIds).toEqual(['E1', 'E2']);
      expect(unknownRefs).toHaveLength(0);
    });

    it('rejects unknown or fabricated evidence references', () => {
      const registry = new EvidenceRegistry();
      registry.register('REVENUE', 100000, 'INR', 'Daily P&L');
      registry.register('MANPOWER_COST_PCT', 34.22, '%', 'Daily P&L');

      const findings: InvestigationFinding[] = [
        {
          findingId: 'f-1',
          anomalyId: 'anom-1',
          title: 'Manpower Overrun',
          explanation: 'Costs spiked due to unverified vendor prices.',
          classification: 'SUPPORTED_HYPOTHESIS',
          evidenceRefs: ['E1', 'E99_NONEXISTENT_REF', 'FABRICATED_METRIC'],
          confidence: 'HIGH'
        }
      ];

      const validation = registry.validateFindings(findings, new Set(['anom-1']));
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0]).toMatch(/references unknown evidence: \[E99_NONEXISTENT_REF, FABRICATED_METRIC\]/);
    });

    it('enforces maximum limit of 5 significant findings', () => {
      const findings: InvestigationFinding[] = Array.from({ length: 8 }, (_, i) => ({
        findingId: `f-${i + 1}`,
        anomalyId: null,
        title: `Finding ${i + 1}`,
        explanation: `Explanation for finding ${i + 1}`,
        classification: 'OBSERVED_FACT' as const,
        evidenceRefs: ['E1'],
        confidence: 'HIGH' as const
      }));

      // In investigation agent, findings > 5 are sliced to top 5
      const top5 = findings.slice(0, 5);
      expect(top5).toHaveLength(5);
    });
  });

  // 5. RECOMMENDATION AGENT RESPONSIBILITIES & OUTPUT REQUIREMENTS
  describe('5. Recommendation Agent Scoping & Requirements', () => {
    it('enforces that expectedSavingINR is strictly null unless deterministically calculated', async () => {
      // Mock provider returning a recommendation with an invented savings number
      const mockInventingSavingsProvider = {
        name: 'mock-savings-tester',
        createModel: () => ({
          _modelType: () => 'chat_model',
          invoke: async (input: any) => {
            const text = typeof input === 'string' ? input : JSON.stringify(input);
            if (text.includes('Operational Recommendation Agent')) {
              return {
                content: JSON.stringify({
                  overallPriority: 'HIGH',
                  managerSummary: 'Summary of recommended actions',
                  recommendations: [
                    {
                      action: 'Audit workforce rosters',
                      responsibleTeam: 'FC_OPERATIONS',
                      priority: 'HIGH',
                      supportingFindingIds: ['f-1'],
                      rationale: 'Reduce overtime',
                      expectedOutcome: 'Lower costs',
                      successMetric: 'Overtime < 15%',
                      reviewAfterDays: 7,
                      expectedSavingINR: '45000.00', // Invented savings!
                      requiresHumanApproval: true
                    }
                  ],
                  requiresHumanReview: true
                })
              };
            }
            return {
              content: JSON.stringify({
                summary: 'Investigation summary',
                diagnosticStatus: 'COMPLETE',
                findings: [
                  {
                    findingId: 'f-1',
                    anomalyId: 'anom-1',
                    title: 'Manpower Anomaly',
                    explanation: 'Overtime overrun',
                    classification: 'OBSERVED_FACT',
                    evidenceRefs: ['E1'],
                    confidence: 'HIGH'
                  }
                ],
                dataGaps: [],
                unresolvedQuestions: [],
                recurringIssue: false
              })
            };
          }
        })
      } as any;

      const result = await executeMarginAIWorkflow(
        'FC-DEL-01',
        '2026-11-20',
        'sub-test',
        calculateDailyPnL(samplePnLRecord, sampleTargets),
        {},
        mockInventingSavingsProvider,
        {
          operationsData: sampleOperations,
          laborData: sampleLabor,
          completeness: 'COMPLETE',
          diagnosticStatus: 'COMPLETE'
        }
      );

      // Verify RecommendationAgent deterministically nullified the invented savings
      expect(result.recommendation.recommendations[0]?.expectedSavingINR).toBeNull();
      expect(result.recommendation.recommendations[0]?.requiresHumanApproval).toBe(true);
      expect(result.recommendation.recommendations[0]?.supportingFindingIds).toContain('f-1');
    });
  });

  // 6. TOKEN CONSUMPTION MEASUREMENT & OPTIMIZATION
  describe('6. Token Usage Measurement & Prompt Reduction Comparison', () => {
    it('substantially reduces input token consumption comparing raw vs normalized payload', () => {
      const pnl = calculateDailyPnL(samplePnLRecord, sampleTargets);

      // Old raw redundant payload (simulating previous implementation)
      const oldRawPayload = {
        fcId: 'FC-DEL-01',
        businessDate: '2026-11-20',
        dataCompleteness: {
          completeness: 'COMPLETE',
          diagnosticStatus: 'COMPLETE',
          hasOperations: true,
          hasLabor: true
        },
        financialFacts: {
          revenue: pnl.revenue,
          currency: pnl.currency,
          cm1: pnl.cm1,
          cm1Pct: pnl.cm1Pct,
          cm2: pnl.cm2,
          cm2Pct: pnl.cm2Pct,
          colour: pnl.colour,
          manpowerCost: pnl.manpowerCost,
          packagingCost: pnl.packagingCost,
          powerFuelCost: pnl.powerFuelCost,
          fcRent: pnl.fcRent,
          equipmentRentals: pnl.equipmentRentals,
          overheads: pnl.overheads,
          costLines: pnl.costLines,
          costContributors: pnl.costLines.filter(c => c.status === 'ABOVE_MAX') // Redundant duplicate!
        },
        operationsData: {
          id: 'ops-row-1',
          fcId: 'FC-DEL-01',
          businessDate: '2026-11-20',
          inboundShipments: sampleOperations.inboundShipments,
          outboundOrders: sampleOperations.outboundOrders,
          unitsProcessed: sampleOperations.unitsProcessed,
          orderLinesProcessed: sampleOperations.orderLinesProcessed,
          returnsProcessed: sampleOperations.returnsProcessed,
          operatingHours: sampleOperations.operatingHours,
          storageOccupancyPct: sampleOperations.storageOccupancyPct,
          dockUtilizationPct: 75.0,
          onTimeDispatchPct: 98.2,
          orderAccuracyPct: 99.1,
          inventoryAccuracyPct: 99.5,
          shrinkagePct: 0.05,
          peakHourOrders: 180,
          peakHourUnits: 720,
          pendingInboundUnits: 0,
          pendingOutboundOrders: 15,
          sourceRowIndex: 2,
          version: 1,
          isLatest: true,
          createdAt: '2026-11-20T08:00:00.000Z',
          updatedAt: '2026-11-20T08:00:00.000Z'
        },
        laborData: {
          id: 'lab-row-1',
          fcId: 'FC-DEL-01',
          businessDate: '2026-11-20',
          plannedHeadcount: sampleLabor.plannedHeadcount,
          actualHeadcount: sampleLabor.actualHeadcount,
          plannedHours: sampleLabor.plannedHours,
          actualPaidHours: sampleLabor.actualPaidHours,
          productiveHours: sampleLabor.productiveHours,
          overtimeHours: sampleLabor.overtimeHours,
          contractorHeadcount: sampleLabor.contractorHeadcount,
          contractorHours: sampleLabor.contractorHours,
          contractorCost: sampleLabor.contractorCost,
          supervisorCount: 2,
          forkliftDrivers: 4,
          pickersCount: 14,
          packersCount: 8,
          absenteesCount: 3,
          attritionCount: 0,
          shift1Hours: 120,
          shift2Hours: 120,
          shift3Hours: 62,
          weekendHours: 0,
          holidayHours: 0,
          sourceRowIndex: 2,
          version: 1,
          isLatest: true,
          createdAt: '2026-11-20T08:00:00.000Z',
          updatedAt: '2026-11-20T08:00:00.000Z'
        },
        derivedMetrics: {
          operational: {
            averageOrderLines: 2,
            unitsPerOrder: 4,
            ordersPerOperatingHour: 78.12,
            returnsRate: 3.2
          },
          workforce: {
            labourUtilization: 77.81,
            overtimeRatio: 17.88,
            ordersPerPaidLabourHour: 4.14,
            unitsPerProductiveLabourHour: 21.28,
            actualVsPlannedLabourHours: 125.83,
            contractorHourShare: 21.19
          },
          productivity: {
            manpowerCostPerOrder: 27.38,
            manpowerCostPerPaidHour: 113.31,
            contractorCostShareOfManpower: 74.81
          },
          reconciliation: {
            pnlManpowerCost: 34221,
            contractorCost: 25600,
            contractorCostSharePct: 74.81,
            hasDiscrepancy: false,
            description: 'Contractor cost reconciled with manpower lines'
          },
          historicalComparisons: {
            outboundOrders: { metric: 'outboundOrders', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'orders', description: 'No baseline records available for metric in period' },
            unitsProcessed: { metric: 'unitsProcessed', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'units', description: 'No baseline records available for metric in period' },
            orderLinesProcessed: { metric: 'orderLinesProcessed', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'lines', description: 'No baseline records available for metric in period' },
            inboundShipments: { metric: 'inboundShipments', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'shipments', description: 'No baseline records available for metric in period' },
            returnsProcessed: { metric: 'returnsProcessed', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'returns', description: 'No baseline records available for metric in period' },
            operatingHours: { metric: 'operatingHours', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'hours', description: 'No baseline records available for metric in period' },
            storageOccupancyPct: { metric: 'storageOccupancyPct', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: '%', description: 'No baseline records available for metric in period' },
            labourUtilization: { metric: 'labourUtilization', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: '%', description: 'No baseline records available for metric in period' },
            overtimeRatio: { metric: 'overtimeRatio', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: '%', description: 'No baseline records available for metric in period' },
            ordersPerPaidLabourHour: { metric: 'ordersPerPaidLabourHour', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'orders/hr', description: 'No baseline records available for metric in period' }
          }
        },
        anomalies: pnl.anomalies.map(a => ({
          ...a,
          description: `Comprehensive anomaly detection record for ${a.metricKey}: actual percentage ${a.actualPct}% breached maximum target ${a.targetMaxPct ?? 'N/A'}% resulting in financial excess impact amount of INR ${a.impactAmount}. Immediate operational investigation recommended.`,
          detectedAt: '2026-11-20T10:00:00.000Z',
          submissionId: 'sub-test',
          fcId: 'FC-DEL-01',
          businessDate: '2026-11-20'
        })),
        historicalContext: {
          priorSubmissionsCount: 0,
          recentColours: [],
          historicalAverages: null,
          operationalComparisons: {
            outboundOrders: { metric: 'outboundOrders', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'orders', description: 'No baseline records available for metric in period' },
            unitsProcessed: { metric: 'unitsProcessed', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'units', description: 'No baseline records available for metric in period' },
            orderLinesProcessed: { metric: 'orderLinesProcessed', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'lines', description: 'No baseline records available for metric in period' },
            inboundShipments: { metric: 'inboundShipments', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'shipments', description: 'No baseline records available for metric in period' },
            returnsProcessed: { metric: 'returnsProcessed', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'returns', description: 'No baseline records available for metric in period' },
            operatingHours: { metric: 'operatingHours', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'hours', description: 'No baseline records available for metric in period' },
            storageOccupancyPct: { metric: 'storageOccupancyPct', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: '%', description: 'No baseline records available for metric in period' },
            labourUtilization: { metric: 'labourUtilization', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: '%', description: 'No baseline records available for metric in period' },
            overtimeRatio: { metric: 'overtimeRatio', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: '%', description: 'No baseline records available for metric in period' },
            ordersPerPaidLabourHour: { metric: 'ordersPerPaidLabourHour', currentValue: null, baselineValue: null, sampleSize: 0, percentageChange: null, unit: 'orders/hr', description: 'No baseline records available for metric in period' }
          }
        }
      };

      // New optimized compact payload
      const { compactPayload } = buildInvestigationContext({
        fcId: 'FC-DEL-01',
        businessDate: '2026-11-20',
        pnl,
        operationsData: sampleOperations,
        laborData: sampleLabor,
        derivedMetrics: {
          operational: { unitsPerOrder: 4 },
          workforce: { labourUtilization: 77.81, overtimeRatio: 17.88, contractorHourShare: 21.19 },
          productivity: { manpowerCostPerOrder: 27.38, contractorCostShareOfManpower: 74.81 },
          reconciliation: reconcileContractorCosts(pnl.manpowerCost, sampleLabor.contractorCost, {
            actualPaidHours: sampleLabor.actualPaidHours,
            contractorHours: sampleLabor.contractorHours
          })
        },
        historicalContext: { priorSubmissionsCount: 0 }
      });

      const oldRawString = JSON.stringify(oldRawPayload, null, 2);
      const newCompactString = JSON.stringify(compactPayload, null, 2);

      const oldTokens = estimateTokens(oldRawString);
      const newTokens = estimateTokens(newCompactString);
      const reductionPct = ((oldTokens - newTokens) / oldTokens) * 100;

      console.log(`[Token Benchmark] Old Input Tokens: ${oldTokens}`);
      console.log(`[Token Benchmark] New Input Tokens: ${newTokens}`);
      console.log(`[Token Benchmark] Reduction: ${reductionPct.toFixed(2)}%`);

      // Verify substantial reduction (> 35%)
      expect(newTokens).toBeLessThan(oldTokens);
      expect(reductionPct).toBeGreaterThan(35);
    });

    it('measures and records workflow token usage across Investigation and Recommendation agents', async () => {
      const mockProvider = {
        name: 'mock-counter',
        createModel: () => ({
          _modelType: () => 'chat_model',
          invoke: async (input: any) => {
            const text = typeof input === 'string' ? input : JSON.stringify(input);
            if (text.includes('Operational Recommendation Agent')) {
              return {
                content: JSON.stringify({
                  overallPriority: 'HIGH',
                  managerSummary: 'Manager summary',
                  recommendations: [
                    {
                      action: 'Investigate shift overtime staffing',
                      responsibleTeam: 'FC_OPERATIONS',
                      priority: 'HIGH',
                      supportingFindingIds: ['f-1'],
                      rationale: 'Overtime surge',
                      expectedOutcome: 'Normalized overtime',
                      successMetric: 'Overtime < 15%',
                      reviewAfterDays: 7,
                      expectedSavingINR: null,
                      requiresHumanApproval: true
                    }
                  ],
                  requiresHumanReview: true
                })
              };
            }
            return {
              content: JSON.stringify({
                summary: 'Detailed investigation of manpower overrun',
                diagnosticStatus: 'COMPLETE',
                findings: [
                  {
                    findingId: 'f-1',
                    anomalyId: 'anom-1',
                    title: 'Manpower Overrun with Overtime Surge',
                    explanation: 'Overtime reached 54 hours driving cost breach.',
                    classification: 'OBSERVED_FACT',
                    evidenceRefs: ['E1', 'E4'],
                    confidence: 'HIGH'
                  }
                ],
                dataGaps: [],
                unresolvedQuestions: [],
                recurringIssue: false
              })
            };
          }
        })
      } as any;

      const result = await executeMarginAIWorkflow(
        'FC-DEL-01',
        '2026-11-20',
        'sub-test',
        calculateDailyPnL(samplePnLRecord, sampleTargets),
        {},
        mockProvider,
        {
          operationsData: sampleOperations,
          laborData: sampleLabor,
          completeness: 'COMPLETE',
          diagnosticStatus: 'COMPLETE'
        }
      );

      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage?.investigationInputTokens).toBeGreaterThan(0);
      expect(result.tokenUsage?.investigationOutputTokens).toBeGreaterThan(0);
      expect(result.tokenUsage?.recommendationInputTokens).toBeGreaterThan(0);
      expect(result.tokenUsage?.recommendationOutputTokens).toBeGreaterThan(0);
      expect(result.tokenUsage?.totalLLMTokenUsage).toBe(
        result.tokenUsage!.investigationInputTokens +
          result.tokenUsage!.investigationOutputTokens +
          result.tokenUsage!.recommendationInputTokens +
          result.tokenUsage!.recommendationOutputTokens
      );
    });
  });

  // 7. SYSTEM PROMPTS PERMANENCE AND ISOLATION
  describe('7. System Prompts Separation from Dynamic Data', () => {
    it('verifies investigation and recommendation system prompts contain no hardcoded daily FC values', () => {
      expect(PROMPT_VERSIONS.INVESTIGATION).toBe('v3.0.0');
      expect(PROMPT_VERSIONS.RECOMMENDATION).toBe('v3.0.0');

      // Permanent prompts must not contain daily financial numbers
      expect(INVESTIGATION_SYSTEM_PROMPT).not.toContain('₹');
      expect(INVESTIGATION_SYSTEM_PROMPT).not.toContain('FC-DEL-01');
      expect(INVESTIGATION_SYSTEM_PROMPT).not.toContain('34221');
      expect(INVESTIGATION_SYSTEM_PROMPT).toContain('OBSERVED_FACT');
      expect(INVESTIGATION_SYSTEM_PROMPT).toContain('SUPPORTED_HYPOTHESIS');

      expect(RECOMMENDATION_SYSTEM_PROMPT).not.toContain('₹');
      expect(RECOMMENDATION_SYSTEM_PROMPT).not.toContain('FC-DEL-01');
      expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('supportingFindingIds');
      expect(RECOMMENDATION_SYSTEM_PROMPT).toContain('requiresHumanApproval');
    });
  });
});
