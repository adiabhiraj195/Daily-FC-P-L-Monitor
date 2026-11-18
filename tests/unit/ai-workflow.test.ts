import { describe, it, expect } from 'vitest';
import { executeMarginAIWorkflow, requiresAIInvestigation } from '../../packages/ai/src/graph/index.js';
import { MockModelProvider } from '../../packages/ai/src/providers/index.js';
import { CalculatedPnL } from '@prozo/shared';

describe('AI Workflow (LangGraph 2-Agent) Unit Tests', () => {
  const dummyPnL: CalculatedPnL = {
    revenue: '100000.00',
    currency: 'INR',
    manpowerCost: '25000.00',
    packagingCost: '10000.00',
    powerFuelCost: '5000.00',
    fcRent: '12000.00',
    equipmentRentals: '3000.00',
    overheads: '5000.00',
    costLines: [
      {
        lineItem: 'MANPOWER',
        amount: '25000.00',
        percentage: '25.0000',
        targetMinPct: '15.0000',
        targetMaxPct: '20.0000',
        status: 'ABOVE_MAX',
        excessAmount: '5000.00'
      }
    ],
    cm1: '65000.00',
    cm1Pct: '65.0000',
    cm2: '40000.00',
    cm2Pct: '40.0000',
    colour: 'BLUE',
    targetSnapshot: {},
    anomalies: [
      {
        type: 'COST_ABOVE_MAX',
        metricKey: 'MANPOWER',
        actualPct: '25.0000',
        targetMinPct: '15.0000',
        targetMaxPct: '20.0000',
        deviationPP: '5.0000',
        impactAmount: '5000.00',
        severity: 'HIGH',
        description: 'MANPOWER breached max target'
      }
    ]
  };

  it('determines if AI investigation is required correctly', () => {
    // BLUE requires AI
    expect(requiresAIInvestigation(dummyPnL)).toBe(true);

    // GREEN with 0 anomalies does NOT require AI
    const greenPnL: CalculatedPnL = {
      ...dummyPnL,
      colour: 'GREEN',
      anomalies: []
    };
    expect(requiresAIInvestigation(greenPnL)).toBe(false);

    // GREEN with cost anomaly DOES require AI
    const greenWithCostAnomaly: CalculatedPnL = {
      ...dummyPnL,
      colour: 'GREEN',
      anomalies: [dummyPnL.anomalies[0]!]
    };
    expect(requiresAIInvestigation(greenWithCostAnomaly)).toBe(true);
  });

  it('executes both Investigation and Recommendation agents with Mock Provider', async () => {
    const mockProvider = new MockModelProvider();
    const result = await executeMarginAIWorkflow(
      'FC-01',
      '2026-11-17',
      'sub-123',
      dummyPnL,
      {},
      mockProvider
    );

    expect(result.isFallback).toBe(false);
    expect(result.investigation).toBeDefined();
    expect(result.investigation.findings.length).toBeGreaterThan(0);
    expect(result.recommendation).toBeDefined();
    expect(result.recommendation.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendation.recommendations[0]?.relatedFindingIds).toContain(
      result.investigation.findings[0]?.findingId
    );
  });

  it('falls back gracefully to verified numerical findings if LLM fails', async () => {
    // Failing provider
    const failingProvider = {
      name: 'failing',
      createModel: () => ({
        invoke: async () => {
          throw new Error('LLM connection timed out');
        }
      })
    } as any;

    const result = await executeMarginAIWorkflow(
      'FC-01',
      '2026-11-17',
      'sub-123',
      dummyPnL,
      {},
      failingProvider
    );

    expect(result.isFallback).toBe(true);
    expect(result.investigation).toBeDefined();
    expect(result.investigation.findings.length).toBeGreaterThan(0);
    expect(result.investigation.findings[0]?.explanation).toMatch(/MANPOWER breached/);
    expect(result.recommendation).toBeDefined();
    expect(result.recommendation.recommendations.length).toBeGreaterThan(0);
  });

  it('correctly configures and attaches LangSmith traces when enabled', async () => {
    process.env.LANGCHAIN_TRACING_V2 = 'true';
    process.env.LANGCHAIN_API_KEY = 'lsv2_pt_test_key_123456';
    process.env.LANGCHAIN_PROJECT = 'test-margin-monitor';

    const { getLangSmithTracingConfig, createLangSmithConfig } = await import('../../packages/ai/src/tracers/index.js');
    const config = getLangSmithTracingConfig();
    expect(config.enabled).toBe(true);
    expect(config.projectName).toBe('test-margin-monitor');

    const runnableConfig = createLangSmithConfig({
      runName: 'TestAgent',
      tags: ['test-tag'],
      metadata: { testMeta: 'value' }
    });

    expect(runnableConfig.runName).toBe('TestAgent');
    expect(runnableConfig.tags).toContain('langsmith-enabled');
    expect(runnableConfig.tags).toContain('test-tag');
    expect(runnableConfig.metadata?.project).toBe('test-margin-monitor');
    expect(runnableConfig.callbacks).toBeDefined();
    expect(runnableConfig.callbacks?.length).toBeGreaterThan(0);

    // Run AI workflow with LangSmith enabled
    const mockProvider = new MockModelProvider();
    const result = await executeMarginAIWorkflow(
      'FC-01',
      '2026-11-17',
      'sub-123',
      dummyPnL,
      {},
      mockProvider
    );
    expect(result.isFallback).toBe(false);
    expect(result.investigation).toBeDefined();

    // Clean up
    delete process.env.LANGCHAIN_TRACING_V2;
    delete process.env.LANGCHAIN_API_KEY;
    delete process.env.LANGCHAIN_PROJECT;
  });

  it('initializes GroqModelProvider and ChatGroq with openai/gpt-oss-120b model', async () => {
    const { GroqModelProvider, ChatGroq, getModelProvider } = await import('../../packages/ai/src/providers/index.js');
    const groqProvider = new GroqModelProvider('gsk_test_123', 'openai/gpt-oss-120b');
    expect(groqProvider.name).toBe('groq');

    const model = groqProvider.createModel() as any;
    expect(model.model).toBe('openai/gpt-oss-120b');
    expect(model.clientConfig.baseURL).toBe('https://api.groq.com/openai/v1');

    const directChatGroq = new ChatGroq({ apiKey: 'gsk_test_direct' });
    expect((directChatGroq as any).model).toBe('openai/gpt-oss-120b');
    expect((directChatGroq as any).clientConfig.baseURL).toBe('https://api.groq.com/openai/v1');

    // Test getModelProvider selecting Groq
    process.env.LLM_PROVIDER = 'groq';
    process.env.GROQ_API_KEY = 'gsk_real_key_123';
    const provider = getModelProvider();
    expect(provider.name).toBe('groq');

    delete process.env.GROQ_API_KEY;
  });
});
