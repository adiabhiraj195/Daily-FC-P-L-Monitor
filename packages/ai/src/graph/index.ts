import { MarginGraphState } from '../state/index.js';
import { ModelProvider, getModelProvider } from '../providers/index.js';
import { runInvestigationAgent } from '../agents/investigation/index.js';
import { runRecommendationAgent } from '../agents/recommendation/index.js';
import { getLangSmithTracingConfig } from '../tracers/index.js';
import { CalculatedPnL, InvestigationOutput, RecommendationOutput } from '@prozo/shared';

/**
 * Checks whether an FC submission requires AI investigation.
 * Exactly as per Section 6.1:
 * - Run AI only when there is a material anomaly or a Blue suspicious-margin status requiring review.
 * - Healthy, non-suspicious records with no cost-line anomalies do not need LLM calls.
 */
export function requiresAIInvestigation(pnl: CalculatedPnL): boolean {
  if (pnl.colour === 'BLUE') {
    return true;
  }
  if (pnl.anomalies.length > 0) {
    return true;
  }
  return false;
}

/**
 * Generates a purely deterministic fallback report based solely on verified numerical facts.
 * Used when LLM calls fail or exceed retries.
 */
export function generateDeterministicFallback(state: MarginGraphState): {
  investigation: InvestigationOutput;
  recommendation: RecommendationOutput;
} {
  const findings = state.pnl.anomalies.map((a, idx) => ({
    findingId: `num-${idx + 1}`,
    anomalyId: null,
    lineItem: a.metricKey,
    explanation: a.description,
    evidenceRefs: [a.metricKey, 'REVENUE'],
    confidence: 'HIGH' as const
  }));

  if (findings.length === 0 && state.pnl.colour === 'BLUE') {
    findings.push({
      findingId: 'num-blue',
      anomalyId: null,
      lineItem: 'CM2',
      explanation: `Suspiciously high CM2 margin of ${state.pnl.cm2Pct}% exceeds 33%. Review for unbooked expenses.`,
      evidenceRefs: ['CM2', 'REVENUE'],
      confidence: 'HIGH' as const
    });
  }

  const investigation: InvestigationOutput = {
    summary: `Deterministic analysis flagged ${state.pnl.anomalies.length} anomaly(ies) with status ${state.pnl.colour}.`,
    findings,
    possibleCauses: [
      {
        cause: 'Numerical deviation detected exceeding configured target envelope.',
        supportingEvidenceRefs: ['REVENUE'],
        confidence: 'HIGH' as const
      }
    ],
    recurringIssue: false,
    unresolvedQuestions: ['Detailed operational root cause requires managerial review.']
  };

  const recommendations: RecommendationOutput = {
    overallPriority: state.pnl.colour === 'RED' ? 'CRITICAL' : 'HIGH',
    managerSummary: 'Review flagged cost breaches and verify unbooked or anomalous line items.',
    recommendations: findings.map(f => ({
      action: `Investigate overrun in ${f.lineItem} and reconcile against shift dispatch reports.`,
      responsibleTeam: f.lineItem === 'MANPOWER' ? 'FC_OPERATIONS' : 'FINANCE',
      priority: state.pnl.colour === 'RED' ? 'CRITICAL' : 'HIGH',
      reason: f.explanation,
      relatedFindingIds: [f.findingId]
    })),
    requiresHumanReview: true
  };

  return { investigation, recommendation: recommendations };
}

/**
 * Executes the LangGraph 2-agent workflow.
 */
export async function executeMarginAIWorkflow(
  fcId: string,
  businessDate: string,
  submissionId: string,
  pnl: CalculatedPnL,
  historicalContext: Record<string, any> = {},
  customProvider?: ModelProvider
): Promise<{
  investigation: InvestigationOutput;
  recommendation: RecommendationOutput;
  isFallback: boolean;
  errors: string[];
}> {
  const provider = customProvider || getModelProvider();
  const langsmithConfig = getLangSmithTracingConfig();
  console.log(`[AI_WORKFLOW] Initializing LangGraph 2-agent workflow: FC=${fcId}, Date=${businessDate}, Submission=${submissionId}, Colour=${pnl.colour}, Anomalies=${pnl.anomalies.length}, Provider=${provider.name}`);
  console.log(`[AI_WORKFLOW] LangSmith Tracing: ${langsmithConfig.enabled ? `ACTIVE (Project: "${langsmithConfig.projectName}", Endpoint: "${langsmithConfig.endpoint}")` : 'INACTIVE (Enable with LANGCHAIN_TRACING_V2=true and LANGCHAIN_API_KEY)'}`);

  let state: MarginGraphState = {
    fcId,
    businessDate,
    submissionId,
    pnl,
    historicalContext,
    investigation: null,
    recommendation: null,
    errors: [],
    retryCount: 0,
    isFallback: false
  };

  // Node 1: Investigation Agent
  console.log(`[AI_WORKFLOW] -> Node 1/2: Invoking Investigation Agent...`);
  const investigationResult = await runInvestigationAgent(state, provider);
  state = { ...state, ...investigationResult };

  // Retry once if investigation failed
  if (!state.investigation && state.retryCount < 1) {
    state.retryCount++;
    console.warn(`[AI_WORKFLOW] Investigation Agent returned no output. Retrying (attempt ${state.retryCount + 1})...`);
    const retryInvestigation = await runInvestigationAgent(state, provider);
    state = { ...state, ...retryInvestigation };
  }

  // If still failed, use deterministic fallback
  if (!state.investigation) {
    console.warn(`[AI_WORKFLOW] Investigation Agent failed after retries. Generating deterministic fallback report...`);
    const fallback = generateDeterministicFallback(state);
    return {
      investigation: fallback.investigation,
      recommendation: fallback.recommendation,
      isFallback: true,
      errors: state.errors
    };
  }
  console.log(`[AI_WORKFLOW] Node 1/2 completed: Investigation succeeded with ${state.investigation.findings.length} findings`);

  // Node 2: Recommendation Agent
  console.log(`[AI_WORKFLOW] -> Node 2/2: Invoking Recommendation Agent with ${state.investigation.findings.length} findings...`);
  const recommendationResult = await runRecommendationAgent(state, provider);
  state = { ...state, ...recommendationResult };

  if (!state.recommendation) {
    console.warn(`[AI_WORKFLOW] Recommendation Agent failed. Generating deterministic fallback recommendations...`);
    const fallback = generateDeterministicFallback(state);
    return {
      investigation: state.investigation!,
      recommendation: fallback.recommendation,
      isFallback: true,
      errors: state.errors
    };
  }

  console.log(`[AI_WORKFLOW] Node 2/2 completed: Generated ${state.recommendation.recommendations.length} recommendations (Priority: ${state.recommendation.overallPriority})`);
  console.log(`[AI_WORKFLOW] LangGraph workflow finished successfully (isFallback: false)`);

  return {
    investigation: state.investigation!,
    recommendation: state.recommendation,
    isFallback: false,
    errors: state.errors
  };
}
