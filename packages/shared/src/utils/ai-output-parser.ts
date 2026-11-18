/**
 * Robust utilities for parsing, normalizing, and reference-resolving
 * AI Investigation and Recommendation Agent inputs and outputs.
 */

export interface ResolvedEvidence {
  id: string;
  metric: string;
  label: string;
  value: string | number | null;
  formattedValue: string;
  unit: string;
  source: string;
  description?: string;
}

export interface ResolvedAnomaly {
  id: string;
  metricKey: string;
  label: string;
  type: string;
  severity: string;
  actualPct: string;
  targetMinPct: string;
  targetMaxPct: string;
  deviationFromTargetPP: string | null;
  breachBeyondTolerancePP: string | null;
  impactAmount: string | null;
}

export interface NormalizedFinding {
  findingId: string;
  anomalyId: string | null;
  title: string;
  classification: 'OBSERVED_FACT' | 'SUPPORTED_HYPOTHESIS' | 'UNVERIFIED_POSSIBILITY' | 'DATA_QUALITY_ISSUE';
  explanation: string;
  evidenceRefs: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  lineItem?: string;
  evidence?: any[];
}

export interface NormalizedInvestigationOutput {
  summary: string;
  diagnosticStatus: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_DATA' | 'VALIDATION_FAILED' | 'FAILED';
  findings: NormalizedFinding[];
  dataGaps: string[];
  unresolvedQuestions: string[];
  recurringIssue: boolean;
  possibleCauses?: Array<{ cause: string; confidence: string }>;
  evidenceCompleteness?: string;
  missingDataPoints?: string[];
  evidenceRegistry?: any[];
  investigationContext?: any;
}

export interface NormalizedRecommendation {
  action: string;
  responsibleTeam: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  supportingFindingIds: string[];
  relatedFindingIds?: string[];
  rationale: string;
  reason?: string;
  expectedOutcome: string;
  successMetric: string;
  reviewAfterDays: number;
  expectedSavingINR: string | null;
  requiresHumanApproval: boolean;
}

export interface NormalizedRecommendationOutput {
  overallPriority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  managerSummary: string;
  recommendations: NormalizedRecommendation[];
  requiresHumanReview: boolean;
}

/**
 * Format raw metric keys (camelCase or SNAKE_CASE) to human-readable titles.
 */
export function formatMetricName(key?: string | null): string {
  if (!key) return '';
  const trimmed = String(key).trim();
  const knownMap: Record<string, string> = {
    MANPOWER: 'Manpower Cost',
    manpowerCost: 'Manpower Cost',
    MANPOWER_COST_AMOUNT: 'Manpower Cost Amount',
    MANPOWER_COST_PCT: 'Manpower Cost %',
    PACKAGING: 'Packaging Cost',
    packagingCost: 'Packaging Cost',
    PACKAGING_COST_AMOUNT: 'Packaging Cost Amount',
    PACKAGING_COST_PCT: 'Packaging Cost %',
    POWER_AND_FUEL: 'Power & Fuel Cost',
    POWER_FUEL: 'Power & Fuel Cost',
    powerFuelCost: 'Power & Fuel Cost',
    POWER_AND_FUEL_COST_AMOUNT: 'Power & Fuel Cost Amount',
    POWER_AND_FUEL_COST_PCT: 'Power & Fuel Cost %',
    FC_RENT: 'FC Rent Cost',
    fcRent: 'FC Rent Cost',
    FC_RENT_COST_AMOUNT: 'FC Rent Cost Amount',
    FC_RENT_COST_PCT: 'FC Rent Cost %',
    EQUIPMENT_RENTALS: 'Equipment Rentals Cost',
    equipmentRentals: 'Equipment Rentals Cost',
    EQUIPMENT_RENTALS_COST_AMOUNT: 'Equipment Rentals Cost Amount',
    EQUIPMENT_RENTALS_COST_PCT: 'Equipment Rentals Cost %',
    OVERHEADS: 'Overheads Cost',
    overheads: 'Overheads Cost',
    OVERHEADS_COST_AMOUNT: 'Overheads Cost Amount',
    OVERHEADS_COST_PCT: 'Overheads Cost %',
    CM1: 'CM1 Margin',
    cm1: 'CM1 Margin',
    CM1_PCT: 'CM1 % Margin',
    cm1Pct: 'CM1 % Margin',
    CM2: 'CM2 Margin',
    cm2: 'CM2 Margin',
    CM2_PCT: 'CM2 % Margin',
    cm2Pct: 'CM2 % Margin',
    REVENUE: 'Daily Revenue',
    revenue: 'Daily Revenue',
    FC_COLOUR: 'FC Colour Status',
    INBOUND_SHIPMENTS: 'Inbound Shipments',
    OUTBOUND_ORDERS: 'Outbound Dispatch Orders',
    UNITS_PROCESSED: 'Units Processed',
    ORDER_LINES_PROCESSED: 'Order Lines Processed',
    RETURNS_PROCESSED: 'Returns Processed',
    OPERATING_HOURS: 'Operating Hours',
    STORAGE_OCCUPANCY_PCT: 'Storage Occupancy %',
    PLANNED_HEADCOUNT: 'Planned Headcount',
    ACTUAL_HEADCOUNT: 'Actual Headcount',
    PLANNED_HOURS: 'Planned Hours',
    ACTUAL_PAID_HOURS: 'Actual Paid Hours',
    PRODUCTIVE_HOURS: 'Productive Hours',
    OVERTIME_HOURS: 'Overtime Hours',
    CONTRACTOR_HEADCOUNT: 'Contractor Headcount',
    CONTRACTOR_HOURS: 'Contractor Hours',
    CONTRACTOR_COST: 'Contractor Cost Amount',
    LABOUR_UTILIZATION_PCT: 'Labour Utilization %',
    OVERTIME_RATIO_PCT: 'Overtime Ratio %',
    CONTRACTOR_HOUR_SHARE_PCT: 'Contractor Hour Share %',
    MANPOWER_COST_PER_ORDER: 'Manpower Cost / Order',
    MANPOWER_COST_PER_PAID_HOUR: 'Manpower Cost / Paid Hour',
    CONTRACTOR_COST_SHARE_PCT: 'Contractor Cost Share %'
  };

  if (knownMap[trimmed]) return knownMap[trimmed];
  const upper = trimmed.toUpperCase();
  if (knownMap[upper]) return knownMap[upper]!;

  // Format SNAKE_CASE
  if (trimmed.includes('_')) {
    return trimmed
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  // Format camelCase
  return trimmed
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Extracts plain text from any nested LangChain message content, block array, or stringified blocks.
 */
export function extractTextContent(content: any): string {
  if (!content) return '';

  if (typeof content === 'string') {
    const trimmed = content.trim();
    // Check if the string itself is a JSON array of text blocks like '[{"type":"text","text":"..."}]'
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const textBlock = parsed.find(b => b && (b.type === 'text' || typeof b.text === 'string'));
          if (textBlock && typeof textBlock.text === 'string') {
            return extractTextContent(textBlock.text);
          }
        } else if (parsed && typeof parsed === 'object') {
          if (parsed.type === 'text' && typeof parsed.text === 'string') {
            return extractTextContent(parsed.text);
          }
        }
      } catch {
        // Not a valid JSON block, return original string
      }
    }
    return content;
  }

  // If array of blocks directly: [{ type: "text", text: "..." }]
  if (Array.isArray(content)) {
    const textBlock = content.find(b => b && (b.type === 'text' || typeof b.text === 'string'));
    if (textBlock && typeof textBlock.text === 'string') {
      return extractTextContent(textBlock.text);
    }
    return content.map(b => (typeof b === 'string' ? b : b?.text || JSON.stringify(b))).join('\n');
  }

  if (content && typeof content === 'object') {
    if (content.type === 'text' && typeof content.text === 'string') {
      return extractTextContent(content.text);
    }
    return JSON.stringify(content);
  }

  return String(content || '');
}

/**
 * Safely parses any AI Investigator or Recommendation output into a typed structured object,
 * handling double-stringified JSON, LangChain text block arrays, and markdown fences.
 */
export function parseAIOutput<T = any>(raw: any): T | null {
  if (!raw) return null;

  let current = raw;

  // If it's already an object (not string, not array) and has expected fields
  if (typeof current === 'object' && !Array.isArray(current) && (current.summary || current.managerSummary || current.findings || current.recommendations)) {
    return current as T;
  }

  // Extract text representation
  const extractedText = extractTextContent(current);
  if (!extractedText) return null;

  let text = extractedText.trim();

  // Strip markdown code fences if present (```json ... ```)
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    // Attempt to extract innermost JSON object {...}
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        return null;
      }
    }
  }

  return null;
}

/**
 * Normalizes an Investigation output object, filling in default structures
 * and safely converting legacy fields so the frontend never crashes.
 */
export function normalizeInvestigationOutput(raw: any): NormalizedInvestigationOutput | null {
  const parsed = parseAIOutput<any>(raw);
  if (!parsed || typeof parsed !== 'object') return null;

  const summary = parsed.summary || parsed.executiveSummary || 'No executive summary provided.';
  const diagnosticStatus = parsed.diagnosticStatus || 'PARTIAL';

  const rawFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings: NormalizedFinding[] = rawFindings.map((f: any, idx: number) => {
    const findingId = f.findingId || `F${idx + 1}`;
    const anomalyId = f.anomalyId ?? null;
    const title = f.title || (f.lineItem ? formatMetricName(f.lineItem) : `Finding ${idx + 1}`);
    const classification = f.classification || 'SUPPORTED_HYPOTHESIS';
    const explanation = f.explanation || f.description || '';
    const evidenceRefs = Array.isArray(f.evidenceRefs)
      ? f.evidenceRefs
      : Array.isArray(f.evidence)
      ? f.evidence.map((e: any) => e.metric || e.id).filter(Boolean)
      : [];
    const confidence = f.confidence || 'HIGH';

    return {
      findingId,
      anomalyId,
      title,
      classification,
      explanation,
      evidenceRefs,
      confidence,
      lineItem: f.lineItem,
      evidence: f.evidence
    };
  });

  const dataGaps = Array.isArray(parsed.dataGaps) ? parsed.dataGaps : [];
  const unresolvedQuestions = Array.isArray(parsed.unresolvedQuestions) ? parsed.unresolvedQuestions : [];
  const recurringIssue = !!parsed.recurringIssue;
  const possibleCauses = Array.isArray(parsed.possibleCauses) ? parsed.possibleCauses : [];
  const evidenceCompleteness = parsed.evidenceCompleteness;
  const missingDataPoints = Array.isArray(parsed.missingDataPoints) ? parsed.missingDataPoints : [];
  const evidenceRegistry = parsed.evidenceRegistry || parsed.investigationContext?.evidenceRegistry;
  const investigationContext = parsed.investigationContext;

  return {
    summary,
    diagnosticStatus,
    findings,
    dataGaps,
    unresolvedQuestions,
    recurringIssue,
    possibleCauses,
    evidenceCompleteness,
    missingDataPoints,
    evidenceRegistry,
    investigationContext
  };
}

/**
 * Normalizes a Recommendation output object.
 */
export function normalizeRecommendationOutput(raw: any): NormalizedRecommendationOutput | null {
  const parsed = parseAIOutput<any>(raw);
  if (!parsed || typeof parsed !== 'object') return null;

  const overallPriority = parsed.overallPriority || parsed.priority || 'HIGH';
  const managerSummary = parsed.managerSummary || parsed.summary || 'Operational corrective recommendations';
  const rawRecs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

  const recommendations: NormalizedRecommendation[] = rawRecs.map((r: any) => ({
    action: r.action || 'Operational Review',
    responsibleTeam: r.responsibleTeam || 'FC_OPERATIONS',
    priority: r.priority || overallPriority,
    supportingFindingIds: Array.isArray(r.supportingFindingIds)
      ? r.supportingFindingIds
      : Array.isArray(r.relatedFindingIds)
      ? r.relatedFindingIds
      : [],
    relatedFindingIds: Array.isArray(r.supportingFindingIds) ? r.supportingFindingIds : [],
    rationale: r.rationale || r.reason || '',
    reason: r.rationale || r.reason || '',
    expectedOutcome: r.expectedOutcome || '',
    successMetric: r.successMetric || '',
    reviewAfterDays: Number(r.reviewAfterDays || 7),
    expectedSavingINR: null, // Deterministically clamped
    requiresHumanApproval: r.requiresHumanApproval !== false
  }));

  return {
    overallPriority,
    priority: overallPriority,
    managerSummary,
    recommendations,
    requiresHumanReview: parsed.requiresHumanReview !== false
  };
}

/**
 * Resolves a single evidence reference (e.g. "E12", "REVENUE", "MANPOWER_COST_AMOUNT")
 * into a structured object using the provided evidenceRegistry or context.
 */
export function resolveEvidenceRef(
  ref: string,
  evidenceRegistry?: any[] | Record<string, any> | string[] | null,
  _contextOrPnl?: any
): ResolvedEvidence {
  const cleanRef = String(ref || '').trim();
  const upperRef = cleanRef.toUpperCase();

  // 1. If registry is an array of strings e.g. ["E12: POWER_AND_FUEL_COST_AMOUNT = 20467.00 INR"]
  if (Array.isArray(evidenceRegistry)) {
    for (const item of evidenceRegistry) {
      if (typeof item === 'string') {
        const match = item.match(/^([A-Za-z0-9_-]+):\s*([^=]+?)\s*=\s*([^\s]+)(?:\s+(.*))?$/);
        if (match) {
          const [, id, metric, value, unit] = match;
          if (id?.toUpperCase() === upperRef || metric?.trim().toUpperCase() === upperRef) {
            const cleanMetric = metric!.trim();
            const cleanUnit = (unit || '').trim();
            const cleanVal = value!.trim();
            const formattedVal =
              cleanUnit === 'INR'
                ? `₹${Number(cleanVal).toLocaleString('en-IN')}`
                : cleanUnit === '%'
                ? `${cleanVal}%`
                : `${cleanVal} ${cleanUnit}`.trim();

            return {
              id: id || cleanRef,
              metric: cleanMetric,
              label: formatMetricName(cleanMetric),
              value: cleanVal,
              formattedValue: formattedVal,
              unit: cleanUnit,
              source: cleanMetric.includes('HOUR') || cleanMetric.includes('HEADCOUNT') ? 'Daily_Labor' : cleanMetric.includes('ORDER') || cleanMetric.includes('UNIT') ? 'Daily_Operations' : 'Daily P&L',
              description: `${formatMetricName(cleanMetric)}: ${formattedVal}`
            };
          }
        }
      } else if (item && typeof item === 'object') {
        // Object format: { id: "E12", metric: "POWER_AND_FUEL", value: "20467", unit: "INR", source: "Daily P&L" }
        if (item.id?.toUpperCase() === upperRef || item.metric?.toUpperCase() === upperRef) {
          const cleanMetric = item.metric || cleanRef;
          const cleanUnit = item.unit || '';
          const cleanVal = item.value !== undefined ? String(item.value) : '';
          const formattedVal =
            cleanUnit === 'INR'
              ? `₹${Number(cleanVal).toLocaleString('en-IN')}`
              : cleanUnit === '%'
              ? `${cleanVal}%`
              : `${cleanVal} ${cleanUnit}`.trim();

          return {
            id: item.id || cleanRef,
            metric: cleanMetric,
            label: formatMetricName(cleanMetric),
            value: item.value ?? null,
            formattedValue: formattedVal,
            unit: cleanUnit,
            source: item.source || 'Evidence Registry',
            description: item.description || `${formatMetricName(cleanMetric)}: ${formattedVal}`
          };
        }
      }
    }
  }

  // 2. Fallback: Parse common metric names or format reference code gracefully
  const label = formatMetricName(cleanRef);
  return {
    id: cleanRef,
    metric: cleanRef,
    label,
    value: null,
    formattedValue: label,
    unit: '',
    source: cleanRef.startsWith('E') ? 'Evidence Registry' : 'Daily Data',
    description: `Reference ${cleanRef}`
  };
}

/**
 * Resolves an array of evidence references.
 */
export function resolveEvidenceRefs(
  refs: string[],
  evidenceRegistry?: any[] | Record<string, any> | string[] | null,
  _contextOrPnl?: any
): ResolvedEvidence[] {
  if (!Array.isArray(refs)) return [];
  return refs.map(ref => resolveEvidenceRef(ref, evidenceRegistry, _contextOrPnl));
}

/**
 * Resolves an anomaly reference (e.g. "anom-2") to its full details from the anomalies list.
 */
export function resolveAnomalyRef(
  anomalyId: string | null | undefined,
  anomaliesList?: any[] | null
): ResolvedAnomaly | null {
  if (!anomalyId || !Array.isArray(anomaliesList)) return null;

  const cleanId = String(anomalyId).trim().toLowerCase();

  // Find by ID match or index match
  const match = anomaliesList.find((a, idx) => {
    if (a.id && String(a.id).trim().toLowerCase() === cleanId) return true;
    if (`anom-${idx + 1}` === cleanId) return true;
    return false;
  });

  if (!match) return null;

  const metricKey = match.metricKey || match.metric || 'UNKNOWN_METRIC';
  const label = formatMetricName(metricKey);
  const type = match.type || 'THRESHOLD_BREACH';
  const severity = match.severity || 'HIGH';
  const actualPct = match.actualPct !== undefined ? `${Number(match.actualPct).toFixed(2)}%` : '—';
  const targetMinPct = match.targetMinPct !== undefined ? `${Number(match.targetMinPct).toFixed(2)}%` : '—';
  const targetMaxPct = match.targetMaxPct !== undefined ? `${Number(match.targetMaxPct).toFixed(2)}%` : '—';
  const deviationFromTargetPP = match.deviationFromTargetPP ? `${Number(match.deviationFromTargetPP).toFixed(2)} pp` : null;
  const breachBeyondTolerancePP = match.breachBeyondTolerancePP ? `${Number(match.breachBeyondTolerancePP).toFixed(2)} pp` : null;
  const impactAmount = match.impactAmount ? `₹${Number(match.impactAmount).toLocaleString('en-IN')}` : null;

  return {
    id: match.id || anomalyId,
    metricKey,
    label,
    type,
    severity,
    actualPct,
    targetMinPct,
    targetMaxPct,
    deviationFromTargetPP,
    breachBeyondTolerancePP,
    impactAmount
  };
}

/**
 * Resolves supporting finding IDs (e.g. ["F1", "F2"]) from the findings list.
 */
export function resolveFindingRefs(
  findingIds: string[],
  findingsList?: NormalizedFinding[] | any[] | null
): NormalizedFinding[] {
  if (!Array.isArray(findingIds) || !Array.isArray(findingsList)) return [];

  const cleanIds = new Set(findingIds.map(id => String(id).trim().toLowerCase()));

  return findingsList.filter(f => {
    const fId = String(f.findingId || '').trim().toLowerCase();
    return cleanIds.has(fId);
  });
}
