import { PrismaClient } from '@prisma/client';

export interface ReaperResult {
  recoveredCount: number;
  failedCount: number;
}

/**
 * Reaps abandoned jobs where workers crashed and heartbeat expired.
 */
export async function reapExpiredLeases(
  prisma: PrismaClient,
  leaseTimeoutSeconds = 120
): Promise<ReaperResult> {
  // 1. Move expired jobs with attempts >= maxAttempts to FAILED
  const failed: any[] = await prisma.$queryRaw`
    UPDATE "BackgroundJob"
    SET status = 'FAILED'::"JobStatus",
        "lastError" = jsonb_build_object('error', 'Job lease expired and maximum attempts reached (worker crashed)'),
        "completedAt" = NOW(),
        "updatedAt" = NOW()
    WHERE status = 'RUNNING'::"JobStatus"
      AND "heartbeatAt" < NOW() - (${leaseTimeoutSeconds} * INTERVAL '1 second')
      AND attempts >= "maxAttempts"
    RETURNING id;
  `;

  // 2. Move expired jobs with remaining attempts to RETRY_WAIT
  const recovered: any[] = await prisma.$queryRaw`
    UPDATE "BackgroundJob"
    SET status = 'RETRY_WAIT'::"JobStatus",
        "availableAt" = NOW() + INTERVAL '5 seconds',
        "lockToken" = NULL,
        "lockedBy" = NULL,
        "lastError" = jsonb_build_object('warn', 'Job lease expired; rescheduled for retry'),
        "updatedAt" = NOW()
    WHERE status = 'RUNNING'::"JobStatus"
      AND "heartbeatAt" < NOW() - (${leaseTimeoutSeconds} * INTERVAL '1 second')
      AND attempts < "maxAttempts"
    RETURNING id;
  `;

  return {
    failedCount: failed.length,
    recoveredCount: recovered.length
  };
}
