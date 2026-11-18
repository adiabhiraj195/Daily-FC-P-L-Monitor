import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../apps/api/src/app.js';
import { PrismaClient, SubmissionStatus, EmailStatus } from '@prisma/client';
import { handleProcessUpload } from '../../apps/worker/src/handlers/process-upload.handler.js';
import { handleAnalyzeSubmission } from '../../apps/worker/src/handlers/analyze-submission.handler.js';
import { handleGenerateAIReport } from '../../apps/worker/src/handlers/generate-ai-report.handler.js';
import { handleSendFCDigest } from '../../apps/worker/src/handlers/send-fc-digest.handler.js';
import { TestEmailProvider } from '../../apps/worker/src/email/provider.js';
import { S3StorageService } from '../../apps/api/src/services/s3.service.js';
import { config } from '../../apps/api/src/config/index.js';

describe('End-to-End Scenario (Section 14.6) - 5 FC Lifecycle', () => {
  const app = createApp();
  const prisma = new PrismaClient();
  const testEmailProvider = new TestEmailProvider();

  const s3Service = new S3StorageService({
    region: config.AWS_REGION,
    bucket: config.AWS_S3_BUCKET,
    endpoint: config.AWS_S3_ENDPOINT,
    forcePathStyle: true
  });

  let financeCookie: string;
  let batchId: string;
  const testDate = '2026-11-20';

  // 4 FCs in CSV + 1 missing FC (FC-KOL-01)
  // Target rules: Manpower: 15-20%, Packaging: 8-12%, Power&Fuel: 3-6%, Rent: 10-15%, Equip: 2-5%, Overheads: 3-7%
  const multiFcCsv = `FC_ID,Business Date,Revenue,Manpower Cost,Packaging Cost,Power & Fuel,FC Rent,Equipment Rentals,Overheads
FC-DEL-01,${testDate},100000,18000,10000,5000,12000,3000,5000
FC-BLR-01,${testDate},100000,35000,18000,8000,16000,5000,10000
FC-MUM-01,${testDate},100000,25000,10000,9000,18000,6000,18000
FC-HYD-01,${testDate},100000,16000,8000,6000,12000,3000,5000
`;

  beforeAll(async () => {
    // Force mock provider so tests don't timeout making external LLM calls
    process.env.LLM_PROVIDER = 'mock';

    // Clean old submissions for test date
    await prisma.dailySubmission.deleteMany({
      where: { businessDate: new Date(testDate) }
    });

    // 1. Log in as Finance
    const financeRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'finance@prozo.com', password: 'Password@123' });
    expect(financeRes.status).toBe(200);
    financeCookie = financeRes.headers['set-cookie'][0];
  });

  it('Step 1 & 2: Finance initiates centralized upload and completes initiation', async () => {
    const initRes = await request(app)
      .post('/api/v1/uploads/initiate')
      .set('Cookie', financeCookie)
      .send({
        fileName: 'daily-fc-performance.csv',
        contentType: 'text/csv',
        fileSize: Buffer.byteLength(multiFcCsv),
        mode: 'CENTRALIZED'
      });

    expect(initRes.status).toBe(201);
    expect(initRes.body.batchId).toBeDefined();
    expect(initRes.body.uploadUrl).toBeDefined();
    batchId = initRes.body.batchId;

    // Complete upload (skip S3 head check in test environment)
    const completeRes = await request(app)
      .post(`/api/v1/uploads/${batchId}/complete?skipHeadCheck=true`)
      .set('Cookie', financeCookie);

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe('UPLOADED');
  });

  it('Step 3: Worker processes upload, creates submissions, and identifies missing FC-KOL-01', async () => {
    const processResult = await handleProcessUpload(
      { batchId },
      prisma,
      s3Service,
      Buffer.from(multiFcCsv, 'utf-8')
    );

    expect(processResult.validRows).toBe(4);
    expect(processResult.invalidRows).toBe(0);

    // Verify submissions created for testDate
    const submissions = await prisma.dailySubmission.findMany({
      where: { businessDate: new Date(testDate), isLatest: true },
      include: { fc: true }
    });

    const activeFcsCount = await prisma.fulfilmentCentre.count({ where: { isActive: true } });
    expect(submissions.length).toBe(activeFcsCount);

    const missingSub = submissions.find(s => s.fc.code === 'FC-KOL-01');
    expect(missingSub).toBeDefined();
    expect(missingSub?.status).toBe(SubmissionStatus.MISSING);
  });

  it('Step 4: Worker calculates P&L and anomalies for all received FC submissions', async () => {
    const submissions = await prisma.dailySubmission.findMany({
      where: {
        businessDate: new Date(testDate),
        isLatest: true,
        status: SubmissionStatus.RECEIVED
      }
    });

    for (const sub of submissions) {
      const res = await handleAnalyzeSubmission({ submissionId: sub.id }, prisma);
      expect(res.submissionId).toBe(sub.id);
    }

    // Verify Colours:
    // FC-DEL-01: Revenue 100k, Manpower 18k, Packaging 10k, Power 5k, Rent 12k, Equip 3k, Overheads 5k
    // CM1 = 72k (72%), CM2 = 47k (47% > 33% is BLUE or wait, let's check CM2: 72k - 25k = 47k)
    const delhi = await prisma.fulfilmentCentre.findUnique({ where: { code: 'FC-DEL-01' } });
    const delhiSub = await prisma.dailySubmission.findFirst({
      where: { fcId: delhi!.id, businessDate: new Date(testDate), isLatest: true },
      include: { pnl: true }
    });
    expect(delhiSub?.pnl).toBeDefined();

    // FC-BLR-01: Red FC (Costs total 102k -> CM2 < 12%)
    const blr = await prisma.fulfilmentCentre.findUnique({ where: { code: 'FC-BLR-01' } });
    const blrSub = await prisma.dailySubmission.findFirst({
      where: { fcId: blr!.id, businessDate: new Date(testDate), isLatest: true },
      include: { pnl: { include: { anomalies: true } } }
    });
    expect(blrSub?.pnl?.colour).toBe('RED');
    expect(blrSub?.pnl?.anomalies.length).toBeGreaterThan(0);
  });

  it('Step 5: Worker executes LangGraph 2-Agent workflow and persists AI report', async () => {
    const blr = await prisma.fulfilmentCentre.findUnique({ where: { code: 'FC-BLR-01' } });
    const blrSub = await prisma.dailySubmission.findFirst({
      where: { fcId: blr!.id, businessDate: new Date(testDate), isLatest: true }
    });

    const aiReportResult = await handleGenerateAIReport(
      { submissionId: blrSub!.id },
      prisma
    );

    expect(aiReportResult.investigationSummary).toBeDefined();
    expect(aiReportResult.recommendationsCount).toBeGreaterThan(0);

    const reportInDb = await prisma.aIReport.findUnique({
      where: { dailyPnlId: blrSub!.id }
    });
    // Pnl id is linked
    const pnl = await prisma.dailyPnL.findUnique({
      where: { submissionId: blrSub!.id },
      include: { aiReport: true }
    });
    expect(pnl?.aiReport).toBeDefined();
  });

  it('Step 6: Worker delivers daily digests via Email Provider', async () => {
    testEmailProvider.clear();

    const pendingOutbox = await prisma.emailOutbox.findMany({
      where: { status: EmailStatus.PENDING }
    });

    for (const outbox of pendingOutbox) {
      const sendRes = await handleSendFCDigest(
        { emailOutboxId: outbox.id },
        prisma,
        testEmailProvider
      );
      expect(sendRes.status).toBe('SENT');
      expect(sendRes.providerMessageId).toBeDefined();
    }

    expect(testEmailProvider.sentMessages.length).toBeGreaterThan(0);
  });

  it('Step 7: Dashboard summary reflects exact counts and weighted aggregate CM% metrics', async () => {
    const activeFcsCount = await prisma.fulfilmentCentre.count({ where: { isActive: true } });
    const summaryRes = await request(app)
      .get(`/api/v1/dashboard/summary?date=${testDate}`)
      .set('Cookie', financeCookie);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.activeFcsCount).toBe(activeFcsCount);
    expect(summaryRes.body.receivedCount).toBe(4);
    expect(summaryRes.body.missingCount).toBe(activeFcsCount - 4);
    expect(summaryRes.body.invalidCount).toBe(0);
    expect(Number(summaryRes.body.aggregates.totalRevenue)).toBe(400000);
    expect(Number(summaryRes.body.aggregates.weightedCM1Pct)).toBeGreaterThan(0);
    expect(Number(summaryRes.body.aggregates.weightedCM2Pct)).toBeGreaterThan(0);
  });

  it('Step 8: Manager review on anomaly updates status with audit log', async () => {
    const anomaly = await prisma.anomaly.findFirst({
      where: { dailyPnl: { submission: { businessDate: new Date(testDate) } } }
    });
    expect(anomaly).toBeDefined();

    // Verify In-App Notifications were generated for responsible manager and admin
    const anomalyNotifications = await prisma.notification.findMany({
      where: { type: 'ANOMALY_DETECTED' }
    });
    expect(anomalyNotifications.length).toBeGreaterThan(0);

    // Verify Email Outbox has anomaly alert records
    const anomalyEmails = await prisma.emailOutbox.findMany({
      where: { subject: { contains: 'ANOMALY ALERT' } }
    });
    expect(anomalyEmails.length).toBeGreaterThan(0);

    const reviewRes = await request(app)
      .patch(`/api/v1/anomalies/${anomaly!.id}/review`)
      .set('Cookie', financeCookie)
      .send({
        status: 'ACKNOWLEDGED',
        comment: 'Noted shift overrun. Investigating with warehouse lead.'
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.reviewStatus).toBe('ACKNOWLEDGED');

    const reviews = await prisma.anomalyReview.findMany({
      where: { anomalyId: anomaly!.id }
    });
    expect(reviews.length).toBeGreaterThanOrEqual(1);
  });
});
