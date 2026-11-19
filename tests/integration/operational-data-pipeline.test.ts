import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../apps/api/src/app.js';
import { PrismaClient } from '@prisma/client';
import { handleProcessUpload } from '../../apps/worker/src/handlers/process-upload.handler.js';
import { handleAnalyzeSubmission } from '../../apps/worker/src/handlers/analyze-submission.handler.js';
import { handleGenerateAIReport } from '../../apps/worker/src/handlers/generate-ai-report.handler.js';
import { S3StorageService } from '../../apps/api/src/services/s3.service.js';
import { config } from '../../apps/api/src/config/index.js';

describe('Operational & Workforce Data Pipeline Integration Tests', () => {
  const app = createApp();
  const prisma = new PrismaClient();

  const s3Service = new S3StorageService({
    region: config.AWS_REGION,
    bucket: config.AWS_S3_BUCKET,
    endpoint: config.AWS_S3_ENDPOINT,
    forcePathStyle: true
  });

  let adminCookie: string;
  let delhiManagerCookie: string;
  let delhiFcId: string;
  let blrFcId: string;

  const testDate = '2026-11-25';

  const pnlCsv = `FC_ID,Business Date,Revenue,Manpower Cost,Packaging Cost,Power & Fuel,FC Rent,Equipment Rentals,Overheads
FC-DEL-01,${testDate},100000,32000,10000,5000,12000,3000,5000
`;

  const operationsCsv = `FC_ID,Business Date,Inbound Shipments,Outbound Orders,Units Processed,Order Lines Processed,Returns Processed,Operating Hours,Storage Occupancy %
FC-DEL-01,${testDate},40,1200,4800,2400,25,16,85.0
`;

  const laborCsv = `FC_ID,Business Date,Planned Headcount,Actual Headcount,Planned Labour Hours,Actual Paid Hours,Productive Hours,Overtime Hours,Contractor Headcount,Contractor Hours,Contractor Cost
FC-DEL-01,${testDate},25,24,200,240,180,40,6,48,12000
`;

  beforeAll(async () => {
    process.env.LLM_PROVIDER = 'mock';

    // Seeded FCs
    const delhi = await prisma.fulfilmentCentre.findUnique({ where: { code: 'FC-DEL-01' } });
    const blr = await prisma.fulfilmentCentre.findUnique({ where: { code: 'FC-BLR-01' } });
    delhiFcId = delhi!.id;
    blrFcId = blr!.id;

    // Clean old test data for testDate
    await prisma.dailySubmission.deleteMany({
      where: { businessDate: new Date(testDate) }
    });
    await prisma.operationalDailyMetrics.deleteMany({
      where: { businessDate: new Date(testDate) }
    });
    await prisma.workforceDailyMetrics.deleteMany({
      where: { businessDate: new Date(testDate) }
    });

    // 1. Login as Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@prozo.com', password: 'Password@123' });
    expect(adminRes.status).toBe(200);
    adminCookie = adminRes.headers['set-cookie'][0];

    // 2. Login as Delhi Manager
    const managerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager.delhi@prozo.com', password: 'Password@123' });
    expect(managerRes.status).toBe(200);
    delhiManagerCookie = managerRes.headers['set-cookie'][0];
  });

  describe('1. Role-Based Upload Authorization', () => {
    it('allows FC Manager to initiate upload for assigned FC (FC-DEL-01)', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Cookie', delhiManagerCookie)
        .send({
          fileName: 'delhi-operations.csv',
          contentType: 'text/csv',
          fileSize: 1024,
          mode: 'SINGLE_FC',
          fcId: delhiFcId,
          datasetType: 'DAILY_OPERATIONS'
        });

      expect(res.status).toBe(201);
      expect(res.body.batchId).toBeDefined();
    });

    it('rejects FC Manager initiating upload for unassigned FC (FC-BLR-01)', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Cookie', delhiManagerCookie)
        .send({
          fileName: 'blr-operations.csv',
          contentType: 'text/csv',
          fileSize: 1024,
          mode: 'SINGLE_FC',
          fcId: blrFcId,
          datasetType: 'DAILY_OPERATIONS'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/);
    });

    it('rejects FC Manager initiating multi-FC CENTRALIZED upload', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Cookie', delhiManagerCookie)
        .send({
          fileName: 'all-fcs-operations.csv',
          contentType: 'text/csv',
          fileSize: 1024,
          mode: 'CENTRALIZED',
          datasetType: 'DAILY_OPERATIONS'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/Forbidden/);
    });

    it('allows ADMIN to initiate multi-FC CENTRALIZED upload for any operational dataset', async () => {
      const res = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Cookie', adminCookie)
        .send({
          fileName: 'central-labor.csv',
          contentType: 'text/csv',
          fileSize: 1024,
          mode: 'CENTRALIZED',
          datasetType: 'DAILY_LABOR'
        });

      expect(res.status).toBe(201);
      expect(res.body.batchId).toBeDefined();
    });
  });

  describe('2. End-to-End Pipeline & Late-Arriving Operational Revision Flow', () => {
    let pnlSubmissionId: string;
    let pnlRecordId: string;
    let anomalyRecordId: string;

    it('Step A: Ingest Daily P&L first -> AI report CANNOT be triggered until all 3 files exist', async () => {
      // 1. Upload P&L batch
      const initRes = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Cookie', adminCookie)
        .send({
          fileName: 'pnl.csv',
          contentType: 'text/csv',
          fileSize: Buffer.byteLength(pnlCsv),
          mode: 'CENTRALIZED',
          datasetType: 'PNL'
        });
      const batchId = initRes.body.batchId;

      await request(app)
        .post(`/api/v1/uploads/${batchId}/complete?skipHeadCheck=true`)
        .set('Cookie', adminCookie);

      // Process upload via worker handler
      await handleProcessUpload({ batchId }, prisma, s3Service, Buffer.from(pnlCsv, 'utf-8'));

      // Retrieve submission
      const sub = await prisma.dailySubmission.findFirst({
        where: { businessDate: new Date(testDate), fcId: delhiFcId, isLatest: true }
      });
      expect(sub).toBeDefined();
      pnlSubmissionId = sub!.id;

      // Analyze submission (Financial calculations & anomaly detection)
      await handleAnalyzeSubmission({ submissionId: pnlSubmissionId }, prisma);

      const dailyPnl = await prisma.dailyPnL.findUnique({
        where: { submissionId: pnlSubmissionId },
        include: { anomalies: true }
      });
      expect(dailyPnl).toBeDefined();
      expect(dailyPnl!.anomalies.length).toBeGreaterThan(0);
      pnlRecordId = dailyPnl!.id;
      anomalyRecordId = dailyPnl!.anomalies[0]!.id;

      // Attempting to generate AI report MUST reject because Operations & Labor are missing
      await expect(
        handleGenerateAIReport({ submissionId: pnlSubmissionId }, prisma)
      ).rejects.toThrow(/all three files.*must be uploaded/i);

      // API trigger endpoint also strictly rejects with HTTP 400
      const triggerRes = await request(app)
        .post(`/api/v1/anomalies/${anomalyRecordId}/trigger-ai`)
        .set('Cookie', adminCookie);
      expect(triggerRes.status).toBe(400);
      expect(triggerRes.body.missingFiles).toContain('Daily Operations');
      expect(triggerRes.body.missingFiles).toContain('Daily Labor');

      // AI Input inspector shows canTrigger = false and details what is missing
      const inputRes = await request(app)
        .get(`/api/v1/anomalies/${anomalyRecordId}/ai-input`)
        .set('Cookie', adminCookie);
      expect(inputRes.status).toBe(200);
      expect(inputRes.body.aiReadiness.canTrigger).toBe(false);
      expect(inputRes.body.aiReadiness.missingFiles).toEqual(['Daily Operations', 'Daily Labor']);

      // Verify completeness API shows FINANCIAL_ONLY
      const compRes = await request(app)
        .get(`/api/v1/uploads/completeness?date=${testDate}`)
        .set('Cookie', adminCookie);
      expect(compRes.status).toBe(200);
      const delhiItem = compRes.body.find((i: any) => i.fcId === delhiFcId);
      expect(delhiItem).toBeDefined();
      expect(delhiItem.completeness).toBe('FINANCIAL_ONLY');
    });

    it('Step B: Late operational throughput upload arrives -> records stored, P&L NOT re-calculated', async () => {
      const initRes = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Cookie', adminCookie)
        .send({
          fileName: 'operations.csv',
          contentType: 'text/csv',
          fileSize: Buffer.byteLength(operationsCsv),
          mode: 'CENTRALIZED',
          datasetType: 'DAILY_OPERATIONS'
        });
      const batchId = initRes.body.batchId;

      await request(app)
        .post(`/api/v1/uploads/${batchId}/complete?skipHeadCheck=true`)
        .set('Cookie', adminCookie);

      const processRes = await handleProcessUpload(
        { batchId },
        prisma,
        s3Service,
        Buffer.from(operationsCsv, 'utf-8')
      );
      expect(processRes.validRows).toBe(1);

      // Verify OperationalDailyMetrics record created
      const opsRecord = await prisma.operationalDailyMetrics.findFirst({
        where: { fcId: delhiFcId, businessDate: new Date(testDate), isLatest: true }
      });
      expect(opsRecord).toBeDefined();
      expect(opsRecord!.outboundOrders).toBe(1200);
      expect(opsRecord!.unitsProcessed).toBe(4800);

      // Verify P&L record was NOT duplicated
      const pnlCount = await prisma.dailyPnL.count({
        where: { submission: { fcId: delhiFcId, businessDate: new Date(testDate) } }
      });
      expect(pnlCount).toBe(1);

      // Attempting to generate AI report STILL rejects because Labor is missing
      await expect(
        handleGenerateAIReport({ submissionId: pnlSubmissionId }, prisma)
      ).rejects.toThrow(/all three files.*must be uploaded/i);

      const triggerRes = await request(app)
        .post(`/api/v1/anomalies/${anomalyRecordId}/trigger-ai`)
        .set('Cookie', adminCookie);
      expect(triggerRes.status).toBe(400);
      expect(triggerRes.body.missingFiles).toEqual(['Daily Labor']);

      // Completeness state is now PENDING_LABOR
      const compRes = await request(app)
        .get(`/api/v1/uploads/completeness?date=${testDate}`)
        .set('Cookie', adminCookie);
      const delhiItem = compRes.body.find((i: any) => i.fcId === delhiFcId);
      expect(delhiItem.completeness).toBe('PENDING_LABOR');
    });

    it('Step C: Daily labor data arrives -> now all 3 files exist, allows triggering AI report (COMPLETE)', async () => {
      const initRes = await request(app)
        .post('/api/v1/uploads/initiate')
        .set('Cookie', adminCookie)
        .send({
          fileName: 'labor.csv',
          contentType: 'text/csv',
          fileSize: Buffer.byteLength(laborCsv),
          mode: 'CENTRALIZED',
          datasetType: 'DAILY_LABOR'
        });
      const batchId = initRes.body.batchId;

      await request(app)
        .post(`/api/v1/uploads/${batchId}/complete?skipHeadCheck=true`)
        .set('Cookie', adminCookie);

      await handleProcessUpload(
        { batchId },
        prisma,
        s3Service,
        Buffer.from(laborCsv, 'utf-8')
      );

      // Verify WorkforceDailyMetrics created
      const laborRecord = await prisma.workforceDailyMetrics.findFirst({
        where: { fcId: delhiFcId, businessDate: new Date(testDate), isLatest: true }
      });
      expect(laborRecord).toBeDefined();
      expect(Number(laborRecord!.overtimeHours)).toBe(40);
      expect(laborRecord!.contractorCost.toString()).toBe('12000');

      // AI Input inspector now shows canTrigger = true and full payload
      const inputRes = await request(app)
        .get(`/api/v1/anomalies/${anomalyRecordId}/ai-input`)
        .set('Cookie', adminCookie);
      expect(inputRes.status).toBe(200);
      expect(inputRes.body.aiReadiness.canTrigger).toBe(true);
      expect(inputRes.body.aiReadiness.hasAllThreeFiles).toBe(true);
      expect(inputRes.body.aiReadiness.missingFiles).toHaveLength(0);
      expect(inputRes.body.inputPayload.operationsData.outboundOrders).toBe(1200);
      expect(inputRes.body.inputPayload.laborData.overtimeHours).toBe(40);

      // Now trigger AI report via the API trigger endpoint
      const triggerRes = await request(app)
        .post(`/api/v1/anomalies/${anomalyRecordId}/trigger-ai`)
        .set('Cookie', adminCookie);
      expect(triggerRes.status).toBe(200);
      expect(triggerRes.body.report).toBeDefined();
      expect(triggerRes.body.report.evidenceCompleteness).toBe('COMPLETE');
      expect(triggerRes.body.report.diagnosticStatus).toBe('COMPLETE');

      const allReports = await prisma.aIReport.findMany({
        where: { dailyPnlId: pnlRecordId },
        orderBy: { version: 'desc' }
      });
      expect(allReports.length).toBeGreaterThanOrEqual(1);

      const latest = allReports[0]!;
      expect(latest.version).toBe(1);
      expect(latest.isLatest).toBe(true);
      expect(latest.evidenceCompleteness).toBe('COMPLETE');
      expect(latest.diagnosticStatus).toBe('COMPLETE');

      // Check DailyPnL latest report relation
      const updatedPnL = await prisma.dailyPnL.findUnique({
        where: { id: pnlRecordId }
      });
      expect(updatedPnL!.latestAiReportId).toBe(latest.id);

      // Check completeness API
      const compRes = await request(app)
        .get(`/api/v1/uploads/completeness?date=${testDate}`)
        .set('Cookie', adminCookie);
      const delhiItem = compRes.body.find((i: any) => i.fcId === delhiFcId);
      expect(delhiItem.completeness).toBe('COMPLETE');
      expect(delhiItem.diagnosticStatus).toBe('COMPLETE');
    });

    it('Step D: Anomaly details endpoint exposes enriched operational context, AI readiness and AI input payload', async () => {
      const res = await request(app)
        .get(`/api/v1/anomalies/${anomalyRecordId}`)
        .set('Cookie', adminCookie);

      expect(res.status).toBe(200);
      const data = res.body;

      // Operational Context enriched
      expect(data.operationalContext).toBeDefined();
      expect(data.operationalContext.operations).toBeDefined();
      expect(data.operationalContext.operations.outboundOrders).toBe(1200);
      expect(data.operationalContext.labor).toBeDefined();
      expect(Number(data.operationalContext.labor.actualPaidHours)).toBe(240);

      // Derived ratios calculated
      expect(data.operationalContext.derived.operations.unitsPerOrder).toBe(4);
      expect(data.operationalContext.derived.workforce.labourUtilization).toBe(75); // (180 / 240) * 100
      expect(data.operationalContext.completeness.completeness).toBe('COMPLETE');

      // AI Readiness and input payload exposed
      expect(data.aiReadiness).toBeDefined();
      expect(data.aiReadiness.canTrigger).toBe(true);
      expect(data.aiInputPayload).toBeDefined();
      expect(data.aiInputPayload.financialFacts.revenue).toBe('100000');
      expect(data.aiPromptPreview).toBeDefined();

      // AI Report versions preserved
      expect(data.aiReportVersions).toBeDefined();
      expect(data.aiReportVersions.length).toBeGreaterThanOrEqual(1);
      expect(data.aiReportVersions[0].version).toBe(1);
    });
  });
});
