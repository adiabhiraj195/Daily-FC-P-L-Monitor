import { PrismaClient, BackgroundJob, JobStatus } from '@prisma/client';
import { claimNextJob, ClaimedJob } from './claim-job.js';
import { renewJobHeartbeat } from './heartbeat.js';
import { reapExpiredLeases } from './lease-reaper.js';
import { calculateNextAvailableAt, isPermanentError } from './retry-policy.js';

export type JobHandler = (payload: any, job: BackgroundJob) => Promise<any>;

export interface WorkerRuntimeConfig {
  workerId: string;
  concurrency: number;
  pollIntervalMs: number;
  leaseSeconds: number;
  heartbeatIntervalSeconds: number;
}

export class WorkerRuntime {
  private handlers = new Map<string, JobHandler>();
  private isRunning = false;
  private isShuttingDown = false;
  private activeJobsCount = 0;
  private heartbeatInterval?: NodeJS.Timeout;
  private reaperInterval?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaClient,
    private config: WorkerRuntimeConfig
  ) {}

  registerHandler(jobType: string, handler: JobHandler): this {
    this.handlers.set(jobType, handler);
    return this;
  }

  async start() {
    this.isRunning = true;
    console.log(`[Worker ${this.config.workerId}] Starting with concurrency ${this.config.concurrency}...`);

    // Setup periodic lease reaper (every 60 seconds)
    this.reaperInterval = setInterval(async () => {
      try {
        const result = await reapExpiredLeases(this.prisma, this.config.leaseSeconds);
        if (result.recoveredCount > 0 || result.failedCount > 0) {
          console.log(`[Worker ${this.config.workerId}] Lease reaper: recovered ${result.recoveredCount}, failed ${result.failedCount}`);
        }
      } catch (err) {
        console.error(`[Worker ${this.config.workerId}] Reaper error:`, err);
      }
    }, 60000);

    // Concurrency loops
    for (let i = 0; i < this.config.concurrency; i++) {
      this.runWorkerLoop(i);
    }
  }

  private async runWorkerLoop(workerSlot: number) {
    while (this.isRunning && !this.isShuttingDown) {
      try {
        const claimed = await claimNextJob(this.prisma, `${this.config.workerId}:slot-${workerSlot}`);
        if (!claimed) {
          // No job available; wait poll interval
          await new Promise(resolve => setTimeout(resolve, this.config.pollIntervalMs));
          continue;
        }

        this.activeJobsCount++;
        await this.processJob(claimed);
        this.activeJobsCount--;
      } catch (err) {
        console.error(`[Worker ${this.config.workerId}:slot-${workerSlot}] Loop error:`, err);
        await new Promise(resolve => setTimeout(resolve, this.config.pollIntervalMs));
      }
    }
  }

  private async processJob(claimed: ClaimedJob) {
    const { job, workerId, lockToken } = claimed;
    console.log(`[WorkerRuntime] Dispatching job: id=${job.id}, type=${job.jobType}, attempt=${job.attempts}/${job.maxAttempts}, worker=${workerId}`);
    const handler = this.handlers.get(job.jobType);

    if (!handler) {
      console.error(`[Worker] No handler registered for job type: ${job.jobType}`);
      await this.prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.FAILED,
          lastError: { error: `No handler registered for job type '${job.jobType}'` },
          completedAt: new Date()
        }
      });
      return;
    }

    // Start background heartbeat
    let leaseLost = false;
    const heartbeatTimer = setInterval(async () => {
      try {
        const renewed = await renewJobHeartbeat(this.prisma, job.id, lockToken, workerId);
        if (!renewed) {
          console.warn(`[Worker] Lease lost for job ${job.id}`);
          leaseLost = true;
          clearInterval(heartbeatTimer);
        }
      } catch (err) {
        console.error(`[Worker] Heartbeat error for job ${job.id}:`, err);
      }
    }, this.config.heartbeatIntervalSeconds * 1000);

    try {
      const result = await handler(job.payload, job);

      clearInterval(heartbeatTimer);

      if (leaseLost) {
        console.warn(`[Worker] Suppressing completion of job ${job.id} due to expired lease`);
        return;
      }

      // Safe update with fencing token: only complete if still holding lockToken
      const updated: any[] = await this.prisma.$queryRaw`
        UPDATE "BackgroundJob"
        SET status = 'SUCCEEDED'::"JobStatus",
            result = ${JSON.stringify(result || {})}::jsonb,
            "completedAt" = NOW(),
            "updatedAt" = NOW()
        WHERE id = ${job.id}
          AND "lockToken" = ${lockToken}
        RETURNING id;
      `;

      if (updated.length === 0) {
        console.warn(`[Worker] Job ${job.id} was not marked SUCCEEDED because lockToken was invalid`);
      } else {
        console.log(`[WorkerRuntime] Job ${job.id} [${job.jobType}] completed successfully (status: SUCCEEDED)`);
      }
    } catch (err: any) {
      clearInterval(heartbeatTimer);

      const isPermanent = isPermanentError(err);
      const isExhausted = job.attempts >= job.maxAttempts;

      const newStatus = isPermanent || isExhausted ? JobStatus.FAILED : JobStatus.RETRY_WAIT;
      const availableAt = newStatus === JobStatus.RETRY_WAIT
        ? calculateNextAvailableAt(job.attempts)
        : job.availableAt;

      console.error(`[Worker] Job ${job.id} (${job.jobType}) failed: ${err.message}. Transitioning to ${newStatus}`);

      await this.prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: newStatus,
          availableAt,
          lastError: {
            message: err.message || String(err),
            stack: err.stack,
            failedAt: new Date().toISOString()
          },
          completedAt: newStatus === JobStatus.FAILED ? new Date() : null
        }
      });
    }
  }

  async stop(timeoutMs = 10000): Promise<void> {
    console.log(`[Worker ${this.config.workerId}] Shutting down gracefully...`);
    this.isShuttingDown = true;
    this.isRunning = false;

    if (this.reaperInterval) clearInterval(this.reaperInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    const start = Date.now();
    while (this.activeJobsCount > 0 && Date.now() - start < timeoutMs) {
      console.log(`[Worker] Waiting for ${this.activeJobsCount} active jobs to finish...`);
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[Worker ${this.config.workerId}] Shutdown complete.`);
  }
}
