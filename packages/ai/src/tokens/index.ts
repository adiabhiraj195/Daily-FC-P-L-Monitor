import { WorkflowTokenUsage } from '@prozo/shared';

/**
 * Estimates token count for text using subword/character heuristics.
 * Average English/JSON text in GPT/Groq models averages ~3.8 to 4 characters per token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 3.8));
}

/**
 * Extracts actual token usage from an LLM response or estimates it if metadata is absent.
 */
export function extractTokenUsage(
  promptText: string,
  response: any
): { inputTokens: number; outputTokens: number } {
  const content =
    typeof response?.content === 'string'
      ? response.content
      : JSON.stringify(response?.content || '');

  // 1. Check LangChain usage_metadata (standard across modern LangChain integrations)
  if (response?.usage_metadata) {
    const input = response.usage_metadata.input_tokens;
    const output = response.usage_metadata.output_tokens;
    if (typeof input === 'number' && typeof output === 'number') {
      return { inputTokens: input, outputTokens: output };
    }
  }

  // 2. Check response_metadata.tokenUsage (OpenAI/Groq metadata format)
  const tokenUsage = response?.response_metadata?.tokenUsage;
  if (tokenUsage) {
    const input = tokenUsage.promptTokens || tokenUsage.input_tokens;
    const output = tokenUsage.completionTokens || tokenUsage.output_tokens;
    if (typeof input === 'number' && typeof output === 'number') {
      return { inputTokens: input, outputTokens: output };
    }
  }

  // 3. Fallback to estimation
  return {
    inputTokens: estimateTokens(promptText),
    outputTokens: estimateTokens(content)
  };
}

export function createEmptyTokenUsage(): WorkflowTokenUsage {
  return {
    investigationInputTokens: 0,
    investigationOutputTokens: 0,
    recommendationInputTokens: 0,
    recommendationOutputTokens: 0,
    totalLLMTokenUsage: 0
  };
}
