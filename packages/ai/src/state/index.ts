import {
  CalculatedPnL,
  InvestigationOutput,
  RecommendationOutput,
  DailyOperationsInput,
  DailyLaborInput,
  EvidenceCompleteness,
  DiagnosticStatus,
  WorkflowTokenUsage,
  InvestigationContext
} from '@prozo/shared';
import { EvidenceRegistry } from '../context/evidence-registry.js';

export interface MarginGraphState {
  fcId: string;
  businessDate: string;
  submissionId: string;
  pnl: CalculatedPnL;
  historicalContext: Record<string, any>;
  operationsData?: DailyOperationsInput | null;
  laborData?: DailyLaborInput | null;
  completeness?: EvidenceCompleteness;
  diagnosticStatus?: DiagnosticStatus;
  derivedMetrics?: {
    operational?: any;
    workforce?: any;
    productivity?: any;
    reconciliation?: any;
    comparisons?: any;
  };
  investigationContext?: InvestigationContext;
  evidenceRegistry?: EvidenceRegistry;
  investigation: InvestigationOutput | null;
  recommendation: RecommendationOutput | null;
  tokenUsage?: WorkflowTokenUsage;
  errors: string[];
  retryCount: number;
  isFallback: boolean;
  version?: number;
  previousReportId?: string | null;
}
