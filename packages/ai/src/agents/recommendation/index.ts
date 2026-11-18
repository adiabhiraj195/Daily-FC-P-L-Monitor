import { MarginGraphState } from '../../state/index.js';
import { ModelProvider } from '../../providers/index.js';
import { RECOMMENDATION_SYSTEM_PROMPT } from '../../prompts/index.js';
import { createLangSmithConfig } from '../../tracers/index.js';
import { extractTokenUsage } from '../../tokens/index.js';
import { recommendationOutputSchema, extractTextContent, parseAIOutput } from '@prozo/shared';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export async function runRecommendationAgent(
  state: MarginGraphState,
  provider: ModelProvider
): Promise<Partial<MarginGraphState>> {
  if (!state.investigation) {
    console.warn(`[RecommendationAgent] Cannot run without validated investigation results`);
    return {
      errors: [...state.errors, 'Recommendation Agent cannot run without validated investigation results.']
    };
  }

  console.log(
    `[RecommendationAgent] Preparing compact payload for FC=${state.fcId}, FindingsCount=${state.investigation.findings.length}`
  );
  const model = provider.createModel({ temperature: 0.1 });

  // 1. Gather only the specific evidence items referenced by validated findings
  const referencedEvidenceIds = new Set<string>();
  for (const f of state.investigation.findings) {
    for (const ref of f.evidenceRefs || []) {
      referencedEvidenceIds.add(ref);
    }
  }

  const supportingEvidence = Array.from(referencedEvidenceIds)
    .map(id => state.evidenceRegistry?.get(id))
    .filter(Boolean)
    .map(e => ({
      id: e!.id,
      metric: e!.metric,
      value: e!.value,
      unit: e!.unit
    }));

  // Critical anomalies summary (minimal fields)
  const criticalAnomalies = state.pnl.anomalies
    .filter(a => a.severity === 'CRITICAL' || a.severity === 'HIGH')
    .map(a => ({
      metricKey: a.metricKey,
      severity: a.severity,
      actualPct: a.actualPct,
      deviationFromTargetPP: a.deviationFromTargetPP ?? a.deviationPP ?? null,
      breachBeyondTolerancePP: a.breachBeyondTolerancePP ?? a.deviationPP ?? null
    }));

  // 2. Compact payload containing ONLY validated investigation results & minimal financial context
  const inputPayload = {
    fcId: state.fcId,
    businessDate: state.businessDate,
    financialContext: {
      colour: state.pnl.colour,
      cm2Pct: state.pnl.cm2Pct,
      criticalAnomalies
    },
    validatedFindings: state.investigation.findings.map(f => ({
      findingId: f.findingId,
      title: f.title,
      classification: f.classification,
      explanation: f.explanation,
      evidenceRefs: f.evidenceRefs,
      confidence: f.confidence
    })),
    supportingEvidence,
    dataGaps: state.investigation.dataGaps,
    historicalResolutionOutcomes: (state.historicalContext as any)?.priorResolutionFeedback || []
  };

  const promptText = `Please recommend practical, evidence-supported actions based on these validated findings:\n${JSON.stringify(inputPayload, null, 2)}`;
  const messages = [
    new SystemMessage(RECOMMENDATION_SYSTEM_PROMPT),
    new HumanMessage(promptText)
  ];

  const langsmithConfig = createLangSmithConfig({
    runName: `RecommendationAgent:${state.fcId}:${state.businessDate}`,
    tags: ['recommendation-agent', state.fcId, state.pnl.colour],
    metadata: {
      agent: 'RecommendationAgent',
      fcId: state.fcId,
      businessDate: state.businessDate,
      submissionId: state.submissionId,
      colour: state.pnl.colour,
      findingsCount: state.investigation.findings.length,
      findingIds: state.investigation.findings.map(f => f.findingId)
    }
  });

  try {
    console.log(`[RecommendationAgent] Sending compact prompt to LLM (${provider.name}) with LangSmith trace context...`);
    const response = await model.invoke(messages, langsmithConfig);
    const usage = extractTokenUsage(promptText, response);

    const textContent = extractTextContent(response.content);
    console.log(`[RecommendationAgent] Received response from LLM (${textContent.length} chars). Parsing JSON...`);

    const parsed = parseAIOutput(textContent);
    if (!parsed) {
      throw new Error(`Failed to parse recommendation JSON from model output: ${textContent.slice(0, 150)}...`);
    }

    const validated = recommendationOutputSchema.parse(parsed);

    // Validate and enforce connection to actual findings & eliminate invented savings
    const existingFindingIds = new Set(state.investigation.findings.map(f => f.findingId));
    const fallbackFindingId = state.investigation.findings[0]?.findingId || 'f-1';

    for (const rec of validated.recommendations) {
      if (!rec.supportingFindingIds || rec.supportingFindingIds.length === 0) {
        rec.supportingFindingIds = [fallbackFindingId];
      } else {
        rec.supportingFindingIds = rec.supportingFindingIds.map(id =>
          existingFindingIds.has(id) ? id : fallbackFindingId
        );
      }
      rec.relatedFindingIds = rec.supportingFindingIds;

      // Deterministic rule: expected savings must remain null unless supplied by authoritative backend
      rec.expectedSavingINR = null;

      // All operational recommendations require human approval
      rec.requiresHumanApproval = true;
    }

    console.log(
      `[RecommendationAgent] Schema validated successfully! Priority=${validated.overallPriority}, RecommendationsCount=${validated.recommendations.length}, Tokens: in=${usage.inputTokens}, out=${usage.outputTokens}`
    );

    const prevTokens = state.tokenUsage || {
      investigationInputTokens: 0,
      investigationOutputTokens: 0,
      recommendationInputTokens: 0,
      recommendationOutputTokens: 0,
      totalLLMTokenUsage: 0
    };

    return {
      recommendation: validated,
      tokenUsage: {
        ...prevTokens,
        recommendationInputTokens: usage.inputTokens,
        recommendationOutputTokens: usage.outputTokens,
        totalLLMTokenUsage: prevTokens.totalLLMTokenUsage + usage.inputTokens + usage.outputTokens
      },
      errors: []
    };
  } catch (err: any) {
    console.error(`[RecommendationAgent] Execution failed:`, err.message);
    return {
      errors: [...state.errors, `Recommendation Agent Error: ${err.message}`]
    };
  }
}
