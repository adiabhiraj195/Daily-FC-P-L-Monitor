import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { RunnableConfig } from '@langchain/core/runnables';

export interface LangSmithTracingConfig {
  enabled: boolean;
  apiKey?: string;
  projectName: string;
  endpoint: string;
}

/**
 * Resolves LangSmith tracing configuration from environment variables.
 * Supports both standard LANGCHAIN_* and LANGSMITH_* naming conventions.
 */
export function getLangSmithTracingConfig(): LangSmithTracingConfig {
  const isTracingV2 =
    process.env.LANGCHAIN_TRACING_V2 === 'true' ||
    process.env.LANGSMITH_TRACING === 'true';

  const apiKey =
    process.env.LANGCHAIN_API_KEY ||
    process.env.LANGSMITH_API_KEY;

  const projectName =
    process.env.LANGCHAIN_PROJECT ||
    process.env.LANGSMITH_PROJECT ||
    'prozo-fc-margin-monitor';

  const endpoint =
    process.env.LANGCHAIN_ENDPOINT ||
    process.env.LANGSMITH_ENDPOINT ||
    'https://api.smith.langchain.com';

  const enabled = Boolean(isTracingV2 && apiKey);

  return {
    enabled,
    apiKey,
    projectName,
    endpoint
  };
}

let cachedTracer: LangChainTracer | null = null;

/**
 * Returns a configured LangChainTracer instance if LangSmith tracing is active.
 * Also synchronizes environment variables for LangChain's native background tracing.
 */
export function getLangSmithTracer(): LangChainTracer | null {
  const config = getLangSmithTracingConfig();

  if (!config.enabled) {
    return null;
  }

  // Ensure environment variables are populated for LangChain's runtime
  process.env.LANGCHAIN_TRACING_V2 = 'true';
  if (config.apiKey) process.env.LANGCHAIN_API_KEY = config.apiKey;
  process.env.LANGCHAIN_PROJECT = config.projectName;
  process.env.LANGCHAIN_ENDPOINT = config.endpoint;

  if (!cachedTracer || cachedTracer.projectName !== config.projectName) {
    cachedTracer = new LangChainTracer({
      projectName: config.projectName
    });
    console.log(`[LangSmith] Tracer initialized for project "${config.projectName}" (endpoint: ${config.endpoint})`);
  }

  return cachedTracer;
}

/**
 * Builds a RunnableConfig for LangChain model and agent invocations with LangSmith callbacks,
 * tags, runName, and metadata.
 */
export function createLangSmithConfig(options: {
  runName: string;
  tags?: string[];
  metadata?: Record<string, any>;
}): RunnableConfig {
  const tracer = getLangSmithTracer();
  const config = getLangSmithTracingConfig();

  const runConfig: RunnableConfig = {
    runName: options.runName,
    tags: [
      'fc-margin-monitor',
      ...(config.enabled ? ['langsmith-enabled'] : ['langsmith-disabled']),
      ...(options.tags || [])
    ],
    metadata: {
      framework: 'LangGraph',
      system: 'Prozo-FC-Margin-Monitor',
      tracingEnabled: config.enabled,
      project: config.projectName,
      ...options.metadata
    }
  };

  if (tracer) {
    runConfig.callbacks = [tracer];
    console.log(`[LangSmith] Attached LangSmith tracer to run "${options.runName}" (project: "${config.projectName}")`);
  } else {
    console.log(`[LangSmith] Tracing inactive for run "${options.runName}" (to enable, configure LANGCHAIN_TRACING_V2=true & LANGCHAIN_API_KEY)`);
  }

  return runConfig;
}
