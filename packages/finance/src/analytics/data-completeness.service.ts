import {
  EvidenceCompleteness,
  DiagnosticStatus,
  DataCompletenessEvaluation
} from '@prozo/shared';

export interface DatasetAvailabilityInput {
  fcId: string;
  businessDate: string; // YYYY-MM-DD
  hasPnl: boolean;
  hasOperations: boolean;
  hasLabor: boolean;
  pnlVersion?: number;
  operationsVersion?: number;
  laborVersion?: number;
}

/**
 * Determines data completeness and diagnostic analysis readiness
 * for an FC on a given business date.
 */
export function evaluateDataCompleteness(
  input: DatasetAvailabilityInput
): DataCompletenessEvaluation {
  const { fcId, businessDate, hasPnl, hasOperations, hasLabor, pnlVersion, operationsVersion, laborVersion } = input;

  let completeness: EvidenceCompleteness;
  let diagnosticStatus: DiagnosticStatus;

  if (hasPnl && hasOperations && hasLabor) {
    completeness = 'COMPLETE';
    diagnosticStatus = 'COMPLETE';
  } else if (hasPnl && !hasOperations && !hasLabor) {
    completeness = 'FINANCIAL_ONLY';
    diagnosticStatus = 'PARTIAL';
  } else if (hasPnl && hasLabor && !hasOperations) {
    completeness = 'PENDING_OPERATIONS';
    diagnosticStatus = 'PARTIAL';
  } else if (hasPnl && hasOperations && !hasLabor) {
    completeness = 'PENDING_LABOR';
    diagnosticStatus = 'PARTIAL';
  } else if (!hasPnl && (hasOperations || hasLabor)) {
    completeness = 'PARTIAL';
    diagnosticStatus = 'INSUFFICIENT_DATA';
  } else {
    completeness = 'INSUFFICIENT_DATA';
    diagnosticStatus = 'INSUFFICIENT_DATA';
  }

  return {
    fcId,
    businessDate,
    hasPnl,
    hasOperations,
    hasLabor,
    completeness,
    diagnosticStatus,
    pnlVersion,
    operationsVersion,
    laborVersion
  };
}

/**
 * Deterministic input fingerprint for AI diagnostic reports.
 * Changes whenever underlying financial, operational, or labor versions/values change.
 */
export function generateInputFingerprint(params: {
  fcId: string;
  businessDate: string;
  pnlVersion?: number;
  operationsVersion?: number | null;
  laborVersion?: number | null;
  model: string;
  promptVersion: string;
}): string {
  const payload = [
    params.fcId,
    params.businessDate,
    `pnl:v${params.pnlVersion ?? 1}`,
    `ops:v${params.operationsVersion ?? 0}`,
    `labor:v${params.laborVersion ?? 0}`,
    `model:${params.model}`,
    `prompt:${params.promptVersion}`
  ].join('::');

  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `fp-${Math.abs(hash).toString(16)}-${payload.length}`;
}
