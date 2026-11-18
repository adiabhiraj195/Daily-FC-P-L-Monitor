import { PrismaClient, BackgroundJob } from '@prisma/client';
import crypto from 'crypto';

export interface ClaimedJob {
  job: BackgroundJob;
  workerId: string;
  lockToken: string;
}

/**
 * Atomically claims one pending/retry_wait job using PostgreSQL FOR UPDATE SKIP LOCKED.
 * Commit happens immediately so the database row lock is released right away.
 */
export async function claimNextJob(
  prisma: PrismaClient,
  workerId: string
): Promise<ClaimedJob | null> {
  const lockToken = crypto.randomUUID();

  // Raw SQL query implementing FOR UPDATE SKIP LOCKED exactly as specified in Section 5.3
  const claimedJobs: BackgroundJob[] = await prisma.$queryRaw<BackgroundJob[]>`
    WITH candidate AS (
      SELECT id
      FROM "BackgroundJob"
      WHERE status IN ('PENDING', 'RETRY_WAIT')
        AND "availableAt" <= NOW()
      ORDER BY priority DESC, "availableAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "BackgroundJob" AS job
    SET status = 'RUNNING'::"JobStatus",
        attempts = attempts + 1,
        "lockedAt" = NOW(),
        "heartbeatAt" = NOW(),
        "lockedBy" = ${workerId},
        "lockToken" = ${lockToken},
        "startedAt" = COALESCE("startedAt", NOW()),
        "updatedAt" = NOW()
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.*;
  `;

  if (!claimedJobs || claimedJobs.length === 0 || !claimedJobs[0]) {
    return null;
  }

  return {
    job: claimedJobs[0],
    workerId,
    lockToken
  };
}
