import { describe, it, expect } from 'vitest';
import {
  extractTextContent,
  parseAIOutput,
  normalizeInvestigationOutput,
  normalizeRecommendationOutput,
  resolveEvidenceRef,
  resolveEvidenceRefs,
  resolveAnomalyRef,
  resolveFindingRefs,
  formatMetricName
} from '@prozo/shared';

describe('AI Output Parser & Reference Resolver Tests', () => {
  // Exact user payload from prompt
  const userOutputSample = `[{"type":"text","text":"{\\n  \\"summary\\": \\"The submission shows several material cost overruns (Power & Fuel, Manpower, Overheads) that drive a critical CM1 shortfall. Manpower costs are inflated by overtime and a high contractor cost share, while energy usage appears excessive relative to throughput. Overheads are also above target without clear breakdown. These issues collectively explain the observed CM1 deviation.\\",\\n  \\"diagnosticStatus\\": \\"PARTIAL\\",\\n  \\"findings\\\": [\\n    {\\n      \\"findingId\\": \\"F1\\",\\n      \\"anomalyId\\": \\"anom-2\\",\\n      \\"title\\": \\"Power & Fuel cost far exceeds target\\",\\n      \\"classification\\": \\"OBSERVED_FACT\\",\\n      \\"explanation\\": \\"Power & Fuel expense is 18.2005% of revenue (₹20,467) versus the allowed maximum of 6%, resulting in an excess of ₹13,719.82. This represents a critical cost overrun and is a primary driver of the CM1 shortfall.\\",\\n      \\"evidenceRefs\\\": [\\"E12\\", \\\"E13\\", \\\"E14\\", \\\"E24\\"],\\n      \\"confidence\\\": \\"HIGH\\"\\n    },\\n    {\\n      \\"findingId\\": \\"F2\\",\\n      \\"anomalyId\\": \\"anom-3\\",\\n      \\"title\\": \\"Manpower cost substantially above target\\",\\n      \\"classification\\": \\"SUPPORTED_HYPOTHESIS\\",\\n      \\"explanation\\": \\"Manpower expense is 30.4314% of revenue (₹34,221) versus the 15‑20% target, exceeding the max by ₹11,730.4. Although headcount is slightly below plan, overtime (26 h) and a large contractor component (₹25,600, 74.8% of total labour cost) inflate the cost per paid hour and per order.\\",\\n      \\"evidenceRefs\\\": [\\"E7\\", \\\"E8\\", \\\"E9\\", \\\"E32\\", \\\"E34\\", \\\"E35\\", \\\"E36\\", \\\"E37\\", \\\"E45\\"],\\n      \\"confidence\\\": \\"MEDIUM\\"\\n    },\\n    {\\n      \\"findingId\\": \\"F3\\",\\n      \\"anomalyId\\": \\"anom-4\\",\\n      \\"title\\": \\"Overheads cost above acceptable range\\",\\n      \\"classification\\": \\"SUPPORTED_HYPOTHESIS\\",\\n      \\"explanation\\": \\"Overheads represent 11.6795% of revenue (₹13,134) against a max of 7%, creating an excess of ₹5,262.29. Without a detailed breakdown, the cause may be indirect admin, insurance, or other fixed costs that have not been scaled appropriately to the current volume.\\",\\n      \\"evidenceRefs\\\": [\\"E19\\", \\\"E20\\", \\\"E21\\"],\\n      \\"confidence\\\": \\"MEDIUM\\"\\n    },\\n    {\\n      \\"findingId\\": \\"F4\\",\\n      \\"anomalyId\\": \\"anom-1\\",\\n      \\"title\\": \\"CM1 contribution margin below target\\",\\n      \\"classification\\": \\"OBSERVED_FACT\\",\\n      \\"explanation\\": \\"CM1 is 61.7707% of revenue (₹69,463), deviating by 3.2293 percentage points from the target tolerance, triggering a high‑severity anomaly. The deviation aligns with the observed cost overruns in Power & Fuel, Manpower, and Overheads.\\",\\n      \\"evidenceRefs\\\": [\\"E1\\", \\\"E2\\", \\\"E3\\"],\\n      \\"confidence\\\": \\"HIGH\\"\\n    },\\n    {\\n      \\"findingId\\": \\"F5\\",\\n      \\"anomalyId\\": null,\\n      \\"title\\": \\"Contractor cost share dominates labour expense\\",\\n      \\"classification\\": \\"SUPPORTED_HYPOTHESIS\\",\\n      \\"explanation\\": \\"Contractor cost accounts for 74.81% of total labour cost and 21.19% of total paid hours, indicating heavy reliance on external labour. This structure likely contributes to the elevated manpower cost percentage and overtime ratio.\\",\\n      \\"evidenceRefs\\\": [\\"E37\\", \\\"E45\\", \\\"E42\\", \\\"E36\\"],\\n      \\"confidence\\\": \\"MEDIUM\\"\\n    }\\n  ],\\n  \\"dataGaps\\\": [\\n    \\"No historical cost percentages or trend data to benchmark current overruns.\\",\\n    \\"Absence of detailed energy consumption (kWh) to quantify the root cause of high Power & Fuel expense.\\",\\n    \\"Missing breakdown of overhead categories (admin, insurance, etc.) to pinpoint drivers.\\",\\n    \\"No contractor cost‑per‑hour data to assess cost efficiency versus permanent staff.\\",\\n    \\"Lack of equipment utilization metrics that could explain energy intensity.\\"\\n  ],\\n  \\"unresolvedQuestions\\\": [\\n    \\"What specific activities or equipment are driving the unusually high Power & Fuel cost?\\",\\n    \\"Why are overheads disproportionately high in this period?\\",\\n    \\"Is the high contractor reliance a strategic choice or a temporary staffing gap?\\",\\n    \\"Can pricing or product mix adjustments improve the CM1 margin?\\",\\n    \\"Would a revised labour budgeting model (e.g., limiting overtime) reduce the manpower cost overrun?\\"\\n  ],\\n  \\"recurringIssue\\\": false\\n}"}]`;

  const sampleEvidenceRegistryStrings = [
    'E1: REVENUE = 100000.00 INR',
    'E2: CM1 = 61770.70 INR',
    'E3: CM1_PCT = 61.77 %',
    'E7: ACTUAL_PAID_HOURS = 302 hours',
    'E8: PRODUCTIVE_HOURS = 235 hours',
    'E9: OVERTIME_HOURS = 54 hours',
    'E12: POWER_AND_FUEL_COST_AMOUNT = 20467.00 INR',
    'E13: POWER_AND_FUEL_COST_PCT = 18.20 %',
    'E14: POWER_AND_FUEL_EXCESS_AMOUNT = 13719.82 INR',
    'E19: OVERHEADS_COST_AMOUNT = 13134.00 INR',
    'E20: OVERHEADS_COST_PCT = 11.68 %',
    'E21: OVERHEADS_EXCESS_AMOUNT = 5262.29 INR',
    'E24: DEVIATION_POWER_AND_FUEL = 12.20 pp',
    'E32: MANPOWER_COST_AMOUNT = 34221.00 INR',
    'E34: MANPOWER_COST_PCT = 30.43 %',
    'E35: MANPOWER_EXCESS_AMOUNT = 11730.40 INR',
    'E36: CONTRACTOR_HOURS = 64 hours',
    'E37: CONTRACTOR_COST = 25600.00 INR',
    'E42: CONTRACTOR_HOUR_SHARE_PCT = 21.19 %',
    'E45: CONTRACTOR_COST_SHARE_PCT = 74.81 %'
  ];

  const sampleAnomaliesList = [
    {
      id: 'anom-1',
      metricKey: 'CM1',
      type: 'CM1_BELOW_MIN',
      severity: 'CRITICAL',
      actualPct: '61.77',
      targetMinPct: '65.00',
      targetMaxPct: '70.00',
      deviationFromTargetPP: '3.23',
      breachBeyondTolerancePP: '0.23',
      impactAmount: '3229.30'
    },
    {
      id: 'anom-2',
      metricKey: 'POWER_AND_FUEL',
      type: 'COST_ABOVE_MAX',
      severity: 'CRITICAL',
      actualPct: '18.20',
      targetMinPct: '3.00',
      targetMaxPct: '6.00',
      deviationFromTargetPP: '12.20',
      breachBeyondTolerancePP: '12.20',
      impactAmount: '13719.82'
    },
    {
      id: 'anom-3',
      metricKey: 'MANPOWER',
      type: 'COST_ABOVE_MAX',
      severity: 'HIGH',
      actualPct: '30.43',
      targetMinPct: '15.00',
      targetMaxPct: '20.00',
      deviationFromTargetPP: '10.43',
      breachBeyondTolerancePP: '10.43',
      impactAmount: '11730.40'
    },
    {
      id: 'anom-4',
      metricKey: 'OVERHEADS',
      type: 'COST_ABOVE_MAX',
      severity: 'HIGH',
      actualPct: '11.68',
      targetMinPct: '2.00',
      targetMaxPct: '7.00',
      deviationFromTargetPP: '4.68',
      breachBeyondTolerancePP: '4.68',
      impactAmount: '5262.29'
    }
  ];

  it('unboxes stringified JSON array of text blocks seamlessly', () => {
    const text = extractTextContent(userOutputSample);
    expect(text).toContain('"summary"');
    expect(text).toContain('"findings"');

    const parsed = parseAIOutput(userOutputSample);
    expect(parsed).toBeDefined();
    expect(parsed.summary).toMatch(/Power & Fuel, Manpower, Overheads/);
    expect(parsed.diagnosticStatus).toBe('PARTIAL');
    expect(parsed.findings).toHaveLength(5);
  });

  it('normalizes the user output sample into a complete typed object', () => {
    const normalized = normalizeInvestigationOutput(userOutputSample);
    expect(normalized).toBeDefined();
    expect(normalized!.summary).toContain('several material cost overruns');
    expect(normalized!.diagnosticStatus).toBe('PARTIAL');
    expect(normalized!.findings).toHaveLength(5);

    // Finding 1
    const f1 = normalized!.findings[0];
    expect(f1?.findingId).toBe('F1');
    expect(f1?.anomalyId).toBe('anom-2');
    expect(f1?.title).toBe('Power & Fuel cost far exceeds target');
    expect(f1?.classification).toBe('OBSERVED_FACT');
    expect(f1?.evidenceRefs).toEqual(['E12', 'E13', 'E14', 'E24']);
    expect(f1?.confidence).toBe('HIGH');

    // Data gaps
    expect(normalized!.dataGaps).toHaveLength(5);
    expect(normalized!.dataGaps[0]).toContain('No historical cost percentages');

    // Unresolved questions
    expect(normalized!.unresolvedQuestions).toHaveLength(5);
    expect(normalized!.unresolvedQuestions[0]).toContain('What specific activities or equipment');
  });

  it('resolves evidence references from string registry correctly', () => {
    const resolvedF1 = resolveEvidenceRefs(['E12', 'E13', 'E14', 'E24'], sampleEvidenceRegistryStrings);
    expect(resolvedF1).toHaveLength(4);

    expect(resolvedF1[0]?.id).toBe('E12');
    expect(resolvedF1[0]?.metric).toBe('POWER_AND_FUEL_COST_AMOUNT');
    expect(resolvedF1[0]?.label).toBe('Power & Fuel Cost Amount');
    expect(resolvedF1[0]?.formattedValue).toBe('₹20,467');
    expect(resolvedF1[0]?.source).toBe('Daily P&L');

    expect(resolvedF1[1]?.id).toBe('E13');
    expect(resolvedF1[1]?.label).toBe('Power & Fuel Cost %');
    expect(resolvedF1[1]?.formattedValue).toBe('18.20%');

    expect(resolvedF1[2]?.id).toBe('E14');
    expect(resolvedF1[2]?.formattedValue).toBe('₹13,719.82');

    expect(resolvedF1[3]?.id).toBe('E24');
    expect(resolvedF1[3]?.formattedValue).toBe('12.20 pp');
  });

  it('resolves evidence references for manpower and contractor hours', () => {
    const resolvedF2 = resolveEvidenceRefs(['E7', 'E8', 'E9', 'E36', 'E37'], sampleEvidenceRegistryStrings);
    expect(resolvedF2).toHaveLength(5);

    expect(resolvedF2[0]?.label).toBe('Actual Paid Hours');
    expect(resolvedF2[0]?.formattedValue).toBe('302 hours');
    expect(resolvedF2[0]?.source).toBe('Daily_Labor');

    expect(resolvedF2[1]?.label).toBe('Productive Hours');
    expect(resolvedF2[1]?.formattedValue).toBe('235 hours');

    expect(resolvedF2[2]?.label).toBe('Overtime Hours');
    expect(resolvedF2[2]?.formattedValue).toBe('54 hours');

    expect(resolvedF2[3]?.label).toBe('Contractor Hours');
    expect(resolvedF2[3]?.formattedValue).toBe('64 hours');

    expect(resolvedF2[4]?.label).toBe('Contractor Cost Amount');
    expect(resolvedF2[4]?.formattedValue).toBe('₹25,600');
  });

  it('resolves anomaly references to authoritative breach numbers', () => {
    const anom2 = resolveAnomalyRef('anom-2', sampleAnomaliesList);
    expect(anom2).toBeDefined();
    expect(anom2?.id).toBe('anom-2');
    expect(anom2?.metricKey).toBe('POWER_AND_FUEL');
    expect(anom2?.label).toBe('Power & Fuel Cost');
    expect(anom2?.severity).toBe('CRITICAL');
    expect(anom2?.actualPct).toBe('18.20%');
    expect(anom2?.targetMaxPct).toBe('6.00%');
    expect(anom2?.breachBeyondTolerancePP).toBe('12.20 pp');
    expect(anom2?.impactAmount).toBe('₹13,719.82');

    const anom1 = resolveAnomalyRef('anom-1', sampleAnomaliesList);
    expect(anom1?.label).toBe('CM1 Margin');
    expect(anom1?.deviationFromTargetPP).toBe('3.23 pp');
    expect(anom1?.breachBeyondTolerancePP).toBe('0.23 pp');

    const nullAnom = resolveAnomalyRef(null, sampleAnomaliesList);
    expect(nullAnom).toBeNull();
  });

  it('resolves recommendation supporting finding references', () => {
    const normalized = normalizeInvestigationOutput(userOutputSample);
    const supporting = resolveFindingRefs(['F1', 'F2'], normalized?.findings);

    expect(supporting).toHaveLength(2);
    expect(supporting[0]?.findingId).toBe('F1');
    expect(supporting[0]?.title).toBe('Power & Fuel cost far exceeds target');
    expect(supporting[1]?.findingId).toBe('F2');
    expect(supporting[1]?.title).toBe('Manpower cost substantially above target');
  });

  it('formats metric names for snake_case and camelCase gracefully', () => {
    expect(formatMetricName('POWER_AND_FUEL')).toBe('Power & Fuel Cost');
    expect(formatMetricName('MANPOWER')).toBe('Manpower Cost');
    expect(formatMetricName('manpowerCost')).toBe('Manpower Cost');
    expect(formatMetricName('cm1Pct')).toBe('CM1 % Margin');
    expect(formatMetricName('STORAGE_OCCUPANCY_PCT')).toBe('Storage Occupancy %');
    expect(formatMetricName(null)).toBe('');
    expect(formatMetricName(undefined)).toBe('');
  });
});
