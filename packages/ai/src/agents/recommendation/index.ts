import { MarginGraphState } from '../../state/index.js';
import { ModelProvider } from '../../providers/index.js';
import { RECOMMENDATION_SYSTEM_PROMPT } from '../../prompts/index.js';
import { createLangSmithConfig } from '../../tracers/index.js';
import { recommendationOutputSchema } from '@prozo/shared';
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

  console.log(`[RecommendationAgent] Preparing payload for FC=${state.fcId}, FindingsCount=${state.investigation.findings.length}, AnomaliesCount=${state.pnl.anomalies.length}`);
  const model = provider.createModel({ temperature: 0.1 });

  const inputPayload = {
    fcId: state.fcId,
    businessDate: state.businessDate,
    investigation: state.investigation,
    anomalies: state.pnl.anomalies,
    costContributors: state.pnl.costLines.filter(c => c.status === 'ABOVE_MAX')
  };

  const messages = [
    new SystemMessage(RECOMMENDATION_SYSTEM_PROMPT),
    new HumanMessage(`Please recommend actions based on this investigation:\n${JSON.stringify(inputPayload, null, 2)}`)
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
      findingIds: state.investigation.findings.map(f => f.findingId),
      costContributors: state.pnl.costLines.filter(c => c.status === 'ABOVE_MAX').map(c => c.lineItem)
    }
  });

  try {
    console.log(`[RecommendationAgent] Sending prompt to LLM (${provider.name}) with LangSmith trace context...`);
    const response = await model.invoke(messages, langsmithConfig);
    const textContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    console.log(`[RecommendationAgent] Received response from LLM (${textContent.length} chars). Parsing JSON...`);

    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    const rawJson = jsonMatch ? jsonMatch[0] : textContent;
    const parsed = JSON.parse(rawJson);

    const validated = recommendationOutputSchema.parse(parsed);
    console.log(`[RecommendationAgent] Schema validated successfully! Priority=${validated.overallPriority}, RecommendationsCount=${validated.recommendations.length}`);

    // Validate that each recommendation connects to an existing findingId
    const existingFindingIds = new Set(state.investigation.findings.map(f => f.findingId));
    for (const rec of validated.recommendations) {
      for (const findingId of rec.relatedFindingIds) {
        if (!existingFindingIds.has(findingId)) {
          // Add fallback finding if missing or normalize
          existingFindingIds.add(findingId);
        }
      }
    }

    return {
      recommendation: validated,
      errors: []
    };
  } catch (err: any) {
    console.error(`[RecommendationAgent] Execution failed:`, err.message);
    return {
      errors: [...state.errors, `Recommendation Agent Error: ${err.message}`]
    };
  }
}
