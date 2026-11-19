export interface RetryConfig {
  baseBackoffMs: number;
  maxBackoffMs: number;
  maxAttempts: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  baseBackoffMs: 2000,
  maxBackoffMs: 300000, // 5 minutes
  maxAttempts: 3
};

/**
 * Calculates next available time using exponential backoff with full random jitter
 */
export function calculateNextAvailableAt(
  attempts: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Date {
  const exponent = Math.max(0, attempts - 1);
  const calculatedDelay = config.baseBackoffMs * Math.pow(2, exponent);
  const boundedDelay = Math.min(calculatedDelay, config.maxBackoffMs);
  
  // Random jitter between 0 and 500ms to avoid thundering herd
  const jitter = Math.floor(Math.random() * 500);
  const totalDelayMs = boundedDelay + jitter;

  return new Date(Date.now() + totalDelayMs);
}

/**
 * Determines whether an error is permanent (non-retryable)
 */
export function isPermanentError(error: any): boolean {
  if (!error) return false;
  const message = error.message ? error.message.toLowerCase() : String(error).toLowerCase();

  const permanentKeywords = [
    'invalid revenue',
    'unsupported file format',
    'missing mandatory header',
    'validation error',
    'unknown fc id',
    'not found',
    'invalid payload',
    'is required',
    'cannot be undefined'
  ];

  return permanentKeywords.some(kw => message.includes(kw));
}
