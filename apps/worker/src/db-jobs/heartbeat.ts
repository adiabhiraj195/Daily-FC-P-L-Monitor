import { PrismaClient } from '@prisma/client';

/**
 * Renews the lease for a running job.
 * Returns true if the lease was successfully renewed;
 * Returns false if the lease was lost (e.g. acquired by reaper or another worker).
 */
export async function renewJobHeartbeat(
  prisma: PrismaClient,
  jobId: string,
  lockToken: string,
  workerId: string
): Promise<boolean> {
  const result: any[] = await prisma.$queryRaw`
    UPDATE "BackgroundJob"
    SET "heartbeatAt" = NOW(),
        "updatedAt" = NOW()
    WHERE id = ${jobId}
      AND "lockToken" = ${lockToken}
      AND "lockedBy" = ${workerId}
      AND status = 'RUNNING'::"JobStatus"
    RETURNING id;
  `;

  return result.length > 0;
}
