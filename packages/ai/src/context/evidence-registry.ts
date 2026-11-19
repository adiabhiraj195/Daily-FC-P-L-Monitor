import { EvidenceItem, InvestigationFinding } from '@prozo/shared';

export class EvidenceRegistry {
  private items: Map<string, EvidenceItem> = new Map();
  private metricToId: Map<string, string> = new Map();
  private counter = 1;

  /**
   * Registers a piece of evidence deterministically.
   * If the metric is already registered, returns the existing ID.
   */
  register(
    metric: string,
    value: number | string | null | undefined,
    unit: string,
    source: string,
    description?: string
  ): string {
    const canonicalMetric = metric.trim().toUpperCase();
    if (this.metricToId.has(canonicalMetric)) {
      return this.metricToId.get(canonicalMetric)!;
    }

    const id = `E${this.counter++}`;
    const cleanValue = value === undefined ? null : value;
    const item: EvidenceItem = {
      id,
      metric: canonicalMetric,
      value: cleanValue,
      unit,
      source,
      description
    };

    this.items.set(id, item);
    this.metricToId.set(canonicalMetric, id);
    return id;
  }

  /**
   * Retrieves an item by evidence ID (e.g. 'E1') or canonical metric key (e.g. 'REVENUE').
   */
  get(keyOrId: string): EvidenceItem | undefined {
    const trimmed = keyOrId.trim();
    if (this.items.has(trimmed)) {
      return this.items.get(trimmed);
    }
    const upper = trimmed.toUpperCase();
    const id = this.metricToId.get(upper);
    return id ? this.items.get(id) : undefined;
  }

  getAll(): EvidenceItem[] {
    return Array.from(this.items.values());
  }

  getCompactRegistry(): Array<{ id: string; metric: string; value: number | string | null; unit: string }> {
    return this.getAll().map(e => ({
      id: e.id,
      metric: e.metric,
      value: e.value,
      unit: e.unit
    }));
  }

  /**
   * Produces a highly compact string index formatted as e.g. ["E1: REVENUE = 100000.00 INR"]
   * for minimal LLM token consumption matching Section 8 guidance.
   */
  toEvidenceIndex(): string[] {
    return this.getAll().map(
      e => `${e.id}: ${e.metric} = ${e.value ?? 'N/A'}${e.unit ? ` ${e.unit}` : ''}`
    );
  }

  /**
   * Resolves an array of evidence references (IDs or metric keys) to their canonical IDs.
   */
  resolveRefs(refs: string[]): { resolvedIds: string[]; unknownRefs: string[] } {
    const resolvedIds: string[] = [];
    const unknownRefs: string[] = [];

    for (const ref of refs) {
      const item = this.get(ref);
      if (item) {
        if (!resolvedIds.includes(item.id)) {
          resolvedIds.push(item.id);
        }
      } else {
        unknownRefs.push(ref);
      }
    }

    return { resolvedIds, unknownRefs };
  }

  /**
   * Validates findings against this evidence registry and known anomaly IDs.
   */
  validateFindings(
    findings: InvestigationFinding[],
    validAnomalyIds: Set<string>
  ): {
    isValid: boolean;
    errors: string[];
    validatedFindings: InvestigationFinding[];
  } {
    const errors: string[] = [];
    const validatedFindings: InvestigationFinding[] = [];
    const seenFindingIds = new Set<string>();

    for (const f of findings) {
      // 1. Finding ID uniqueness
      if (!f.findingId || seenFindingIds.has(f.findingId)) {
        errors.push(`Duplicate or missing findingId: '${f.findingId}'`);
      }
      seenFindingIds.add(f.findingId);

      // 2. Anomaly ID validation
      if (f.anomalyId && !validAnomalyIds.has(f.anomalyId)) {
        errors.push(`Finding '${f.findingId}' references unknown anomalyId '${f.anomalyId}'`);
      }

      // 3. Evidence references validation
      const refs = f.evidenceRefs || [];
      if (refs.length === 0) {
        errors.push(`Finding '${f.findingId}' has no evidence references`);
      }

      const { resolvedIds, unknownRefs } = this.resolveRefs(refs);
      if (unknownRefs.length > 0) {
        errors.push(
          `Finding '${f.findingId}' references unknown evidence: [${unknownRefs.join(', ')}]`
        );
      }

      // Map back to canonical evidence array for legacy compatibility and rich reporting
      const evidenceObjects = resolvedIds
        .map(id => this.items.get(id))
        .filter((e): e is EvidenceItem => e !== undefined)
        .map(e => ({
          metric: e.metric,
          currentValue: typeof e.value === 'number' ? e.value : null,
          baselineValue: null,
          difference: null,
          unit: e.unit,
          source: e.source,
          businessDate: ''
        }));

      validatedFindings.push({
        ...f,
        evidenceRefs: resolvedIds,
        evidence: evidenceObjects
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      validatedFindings
    };
  }
}
