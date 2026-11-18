import { describe, it, expect, beforeAll } from 'vitest';
import { PrismaClient, JobStatus } from '@prisma/client';
import { claimNextJob } from '../../apps/worker/src/db-jobs/claim-job.js';
import { renewJobHeartbeat } from '../../apps/worker/src/db-jobs/heartbeat.js';
import { reapExpiredLeases } from '../../apps/worker/src/db-jobs/lease-reaper.js';

describe('PostgreSQL Worker Concurrency & Lease Fencing Tests (Section 14.3)', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    // Clear old test jobs
    await prisma.backgroundJob.deleteMany({
      where: { idempotencyKey: { startsWith: 'test-concurrency:' } }
    });
  });

  it('FOR UPDATE SKIP LOCKED: two workers cannot claim the same job concurrently', async () => {
    const idempotencyKey = `test-concurrency:job-${Date.now()}`;
    const job = await prisma.backgroundJob.create({
      data: {
        jobType: 'ANALYZE_SUBMISSION',
        payload: { test: true },
        status: JobStatus.PENDING,
        priority: 10,
        idempotencyKey,
        maxAttempts: 3
      }
    });

    // Simulate Worker A and Worker B attempting to claim concurrently
    const [claimA, claimB] = await Promise.all([
      claimNextJob(prisma, 'worker-A'),
      claimNextJob(prisma, 'worker-B')
    ]);

    // Exactly one of the workers must have claimed this job
    const claimedByWorkerA = claimA?.job.id === job.id;
    const claimedByWorkerB = claimB?.job.id === job.id;

    expect(claimedByWorkerA !== claimedByWorkerB).toBe(true);

    // The other worker did not get the same job
    if (claimedByWorkerA) {
      expect(claimB?.job.id).not.toBe(job.id);
    } else {
      expect(claimA?.job.id).not.toBe(job.id);
    }
  });

  it('Duplicate idempotency key insertion is rejected by unique constraint', async () => {
    const key = `test-concurrency:dup-${Date.now()}`;
    await prisma.backgroundJob.create({
      data: {
        jobType: 'PROCESS_UPLOAD',
        payload: { test: true },
        idempotencyKey: key
      }
    });

    await expect(
      prisma.backgroundJob.create({
        data: {
          jobType: 'PROCESS_UPLOAD',
          payload: { test: true },
          idempotencyKey: key
        }
      })
    ).rejects.toThrow();
  });

  it('Heartbeat extension updates heartbeatAt while holding lockToken', async () => {
    const key = `test-concurrency:heartbeat-${Date.now()}`;
    const job = await prisma.backgroundJob.create({
      data: {
        jobType: 'PROCESS_UPLOAD',
        payload: { test: true },
        idempotencyKey: key
      }
    });

    const claimed = await claimNextJob(prisma, 'worker-heartbeat-test');
    expect(claimed).not.toBeNull();

    const renewed = await renewJobHeartbeat(
      prisma,
      claimed!.job.id,
      claimed!.lockToken,
      'worker-heartbeat-test'
    );
    expect(renewed).toBe(true);

    // Attempting heartbeat with wrong lockToken must fail (fenced out)
    const invalidRenewed = await renewJobHeartbeat(
      prisma,
      claimed!.job.id,
      'wrong-lock-token',
      'worker-heartbeat-test'
    );
    expect(invalidRenewed).toBe(false);
  });

  it('Lease reaper recovers expired jobs abandoned by crashed worker', async () => {
    const key = `test-concurrency:reaper-${Date.now()}`;
    // Create a job simulated as claimed by a crashed worker 300 seconds ago
    const expiredTime = new Date(Date.now() - 300 * 1000);
    const job = await prisma.backgroundJob.create({
      data: {
        jobType: 'PROCESS_UPLOAD',
        payload: { test: true },
        status: JobStatus.RUNNING,
        attempts: 1,
        maxAttempts: 3,
        heartbeatAt: expiredTime,
        lockedAt: expiredTime,
        lockedBy: 'crashed-worker-pid-9999',
        lockToken: 'stale-token',
        idempotencyKey: key
      }
    });

    // Run reaper with 120s timeout
    const result = await reapExpiredLeases(prisma, 120);
    expect(result.recoveredCount).toBeGreaterThanOrEqual(1);

    // Verify job transitioned to RETRY_WAIT
    const reapedJob = await prisma.backgroundJob.findUnique({
      where: { id: job.id }
    });
    expect(reapedJob?.status).toBe(JobStatus.RETRY_WAIT);
    expect(reapedJob?.lockToken).toBeNull();
  });
});
