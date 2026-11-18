import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { WorkerRuntime } from './db-jobs/worker-runtime.js';
import { S3StorageService } from './services/s3.service.js';
import { getEmailProvider } from './email/provider.js';
import { handleProcessUpload } from './handlers/process-upload.handler.js';
import { handleAnalyzeSubmission } from './handlers/analyze-submission.handler.js';
import { handleGenerateAIReport } from './handlers/generate-ai-report.handler.js';
import { handleSendFCDigest } from './handlers/send-fc-digest.handler.js';

const prisma = new PrismaClient();

const s3Service = new S3StorageService({
  region: process.env.AWS_REGION || 'ap-south-1',
  bucket: process.env.AWS_S3_BUCKET || 'prozo-margin-monitor-dev',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  endpoint: process.env.AWS_S3_ENDPOINT && process.env.AWS_S3_ENDPOINT.trim() !== '' ? process.env.AWS_S3_ENDPOINT.trim() : undefined,
  forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === 'true'
});

const emailProvider = getEmailProvider();

const workerRuntime = new WorkerRuntime(prisma, {
  workerId: process.env.WORKER_ID || `worker-${process.pid}`,
  concurrency: Number(process.env.WORKER_CONCURRENCY) || 3,
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS) || 1000,
  leaseSeconds: Number(process.env.JOB_LEASE_SECONDS) || 120,
  heartbeatIntervalSeconds: Number(process.env.JOB_HEARTBEAT_INTERVAL_SECONDS) || 30
});

// Register all background handlers
workerRuntime
  .registerHandler('PROCESS_UPLOAD', async payload => {
    return handleProcessUpload(payload, prisma, s3Service);
  })
  .registerHandler('ANALYZE_SUBMISSION', async payload => {
    return handleAnalyzeSubmission(payload, prisma);
  })
  .registerHandler('GENERATE_AI_REPORT', async payload => {
    return handleGenerateAIReport(payload, prisma);
  })
  .registerHandler('SEND_FC_DIGEST', async payload => {
    return handleSendFCDigest(payload, prisma, emailProvider);
  });

async function bootstrap() {
  console.log('--- Prozo FC Margin Monitor Background Worker Initializing ---');
  await workerRuntime.start();

  const handleShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Gracefully stopping worker...`);
    await workerRuntime.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

bootstrap().catch(err => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
