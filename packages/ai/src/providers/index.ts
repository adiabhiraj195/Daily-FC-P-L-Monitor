import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';
import { InvestigationOutput, RecommendationOutput } from '@prozo/shared';

export interface ModelProvider {
  createModel(options?: { temperature?: number }): BaseChatModel;
  name: string;
}

export interface ChatGroqInput {
  apiKey?: string;
  groqApiKey?: string;
  model?: string;
  modelName?: string;
  temperature?: number;
  timeout?: number;
  maxRetries?: number;
  configuration?: Record<string, any>;
}

/**
 * Groq LangChain Chat Model.
 * Uses Groq's high-speed inference engine with OpenAI-compatible API specifications.
 */
export class ChatGroq extends ChatOpenAI {
  constructor(fields?: ChatGroqInput) {
    const apiKey =
      fields?.apiKey ||
      fields?.groqApiKey ||
      process.env.GROQ_API_KEY ||
      process.env.OPENAI_API_KEY ||
      'dummy';

    const modelName =
      fields?.model ||
      fields?.modelName ||
      process.env.GROQ_MODEL ||
      'openai/gpt-oss-120b';

    super({
      apiKey,
      model: modelName,
      temperature: fields?.temperature ?? 0.1,
      timeout: fields?.timeout ?? 30000,
      maxRetries: fields?.maxRetries ?? 2,
      configuration: {
        baseURL: 'https://api.groq.com/openai/v1',
        ...fields?.configuration
      }
    });
  }
}

/**
 * Groq Provider implementing ModelProvider for the FC Margin Monitor AI workflow.
 */
export class GroqModelProvider implements ModelProvider {
  name = 'groq';
  private apiKey: string;
  private modelName: string;
  private timeoutMs: number;

  constructor(
    apiKey?: string,
    modelName = process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    timeoutMs = 30000
  ) {
    this.apiKey =
      apiKey ||
      process.env.GROQ_API_KEY ||
      process.env.OPENAI_API_KEY ||
      'dummy';
    this.modelName = modelName;
    this.timeoutMs = timeoutMs;
  }

  createModel(options?: { temperature?: number }): BaseChatModel {
    console.log(
      `[GroqModelProvider] Initializing ChatGroq LangChain model (model=${this.modelName}, baseURL=https://api.groq.com/openai/v1, timeout=${this.timeoutMs}ms, temperature=${options?.temperature ?? 0.1})`
    );
    return new ChatGroq({
      apiKey: this.apiKey,
      model: this.modelName,
      temperature: options?.temperature ?? 0.1,
      timeout: this.timeoutMs
    });
  }
}

export class OpenAIModelProvider implements ModelProvider {
  name = 'openai';
  private apiKey: string;
  private modelName: string;
  private timeoutMs: number;

  constructor(apiKey?: string, modelName = 'gpt-4o-mini', timeoutMs = 30000) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || 'dummy';
    this.modelName = modelName;
    this.timeoutMs = timeoutMs;
  }

  createModel(options?: { temperature?: number }): BaseChatModel {
    console.log(`[OpenAIModelProvider] Initializing ChatOpenAI (model=${this.modelName}, timeout=${this.timeoutMs}ms, temperature=${options?.temperature ?? 0.1})`);
    return new ChatOpenAI({
      openAIApiKey: this.apiKey,
      modelName: this.modelName,
      temperature: options?.temperature ?? 0.1,
      timeout: this.timeoutMs
    });
  }
}

/**
 * Deterministic Mock Provider for offline testing and environments without an OpenAI API key.
 */
export class MockModelProvider implements ModelProvider {
  name = 'mock';

  createModel(_options?: { temperature?: number }): BaseChatModel {
    // A mock model that returns valid structured JSON matching schemas
    const mockInvestigation: InvestigationOutput = {
      summary: 'Automated analysis identified material cost overruns impacting contribution margins with partial operational evidence.',
      diagnosticStatus: 'PARTIAL',
      findings: [
        {
          findingId: 'f-1',
          anomalyId: 'anom-1',
          title: 'Manpower Cost Anomaly with Overtime Spike',
          lineItem: 'MANPOWER',
          explanation: 'Manpower costs exceeded target threshold due to operational overtime.',
          classification: 'SUPPORTED_HYPOTHESIS',
          evidence: [
            {
              metric: 'MANPOWER_COST_AMOUNT',
              currentValue: 25000,
              baselineValue: 20000,
              difference: 5000,
              unit: 'INR',
              source: 'Daily P&L',
              businessDate: '2026-11-17'
            }
          ],
          evidenceRefs: ['MANPOWER_COST_AMOUNT', 'MANPOWER_COST_PCT'],
          confidence: 'HIGH'
        }
      ],
      possibleCauses: [
        {
          cause: 'Unexpected surge in dispatch volumes requiring unplanned overtime staffing.',
          supportingEvidenceRefs: ['MANPOWER_COST_AMOUNT'],
          confidence: 'MEDIUM'
        }
      ],
      dataGaps: ['Shift-level badge swipe data not yet ingested.'],
      unresolvedQuestions: ['Were overtime hours pre-authorized by FC leadership?'],
      recurringIssue: false
    };

    const mockRecommendation: RecommendationOutput = {
      overallPriority: 'HIGH',
      managerSummary: 'Immediate audit of shift scheduling and overtime staffing required.',
      recommendations: [
        {
          action: 'Audit shift rosters and implement overtime pre-clearance protocol.',
          responsibleTeam: 'FC_OPERATIONS',
          priority: 'HIGH',
          supportingFindingIds: ['f-1'],
          relatedFindingIds: ['f-1'],
          rationale: 'Address primary contributor to margin deterioration.',
          reason: 'Address primary contributor to margin deterioration.',
          expectedOutcome: 'Reduce unauthorized overtime hours by 20%.',
          successMetric: 'Overtime ratio < 15% of actual paid hours',
          reviewAfterDays: 7,
          expectedSavingINR: null,
          requiresHumanApproval: true
        }
      ],
      requiresHumanReview: true
    };

    // Return a fake chat model
    return {
      _modelType: () => 'chat_model',
      invoke: async (input: any, config?: any) => {
        const text = typeof input === 'string' ? input : JSON.stringify(input);
        const agentType = text.includes('Recommendation Agent') || text.includes('overallPriority')
          ? 'RecommendationAgent'
          : 'InvestigationAgent';
        console.log(`[MockModelProvider] Simulated LLM response returned for ${agentType}${config?.runName ? ` (run: "${config.runName}")` : ''}`);
        if (agentType === 'RecommendationAgent') {
          return new AIMessage(JSON.stringify(mockRecommendation));
        }
        return new AIMessage(JSON.stringify(mockInvestigation));
      }
    } as unknown as BaseChatModel;
  }
}

export function getModelProvider(): ModelProvider {
  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();
  const groqApiKey = process.env.GROQ_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const groqModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

  // 1. Mock fallback for local tests and environments without API keys
  if (
    provider === 'mock' ||
    (provider === 'groq' && (!groqApiKey || groqApiKey === 'mock-key-for-local-testing' || groqApiKey.startsWith('gsk_your_groq'))) ||
    (provider === 'openai' && (!openaiApiKey || openaiApiKey === 'mock-key-for-local-testing'))
  ) {
    console.log(`[ModelProvider] Selecting MockModelProvider (LLM_PROVIDER="${provider}")`);
    return new MockModelProvider();
  }

  // 2. Groq Provider (Default)
  if (provider === 'groq') {
    console.log(`[ModelProvider] Selecting GroqModelProvider (model="${groqModel}", endpoint="https://api.groq.com/openai/v1")`);
    return new GroqModelProvider(groqApiKey, groqModel);
  }

  // 3. OpenAI Provider
  console.log(`[ModelProvider] Selecting OpenAIModelProvider (model="${process.env.OPENAI_MODEL || 'gpt-4o-mini'}")`);
  return new OpenAIModelProvider(openaiApiKey, process.env.OPENAI_MODEL);
}
