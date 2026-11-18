import { CalculatedPnL, InvestigationOutput, RecommendationOutput } from '@prozo/shared';

export interface MarginGraphState {
  fcId: string;
  businessDate: string;
  submissionId: string;
  pnl: CalculatedPnL;
  historicalContext: Record<string, any>;
  investigation: InvestigationOutput | null;
  recommendation: RecommendationOutput | null;
  errors: string[];
  retryCount: number;
  isFallback: boolean;
}
