import { PrismaClient, UploadBatchStatus, SubmissionStatus, JobStatus } from '@prisma/client';
import { parseSpreadsheetBuffer } from '@prozo/finance';
import { S3StorageService } from '../services/s3.service.js';

export async function handleProcessUpload(
  payload: { batchId: string },
  prisma: PrismaClient,
  s3Service: S3StorageService,
  mockFileBuffer?: Buffer // for testing without S3
) {
  const { batchId } = payload;
  console.log(`[PROCESS_UPLOAD] Starting processing for batchId=${batchId}`);

  const batch = await prisma.uploadBatch.findUnique({
    where: { id: batchId }
  });

  if (!batch) {
    console.error(`[PROCESS_UPLOAD] UploadBatch '${batchId}' not found in database`);
    throw new Error(`UploadBatch '${batchId}' not found`);
  }

  await prisma.uploadBatch.update({
    where: { id: batchId },
    data: { status: UploadBatchStatus.PROCESSING }
  });
  console.log(`[PROCESS_UPLOAD] Batch ${batchId} status updated to PROCESSING. Source file="${batch.originalFileName}"`);

  // Download file from S3 or use mock buffer
  let fileBuffer: Buffer;
  if (mockFileBuffer) {
    console.log(`[PROCESS_UPLOAD] Using mock file buffer (${mockFileBuffer.length} bytes)`);
    fileBuffer = mockFileBuffer;
  } else {
    try {
      console.log(`[PROCESS_UPLOAD] Downloading object from S3: bucket=${batch.bucket}, key=${batch.objectKey}`);
      fileBuffer = await s3Service.downloadObject(batch.objectKey);
      console.log(`[PROCESS_UPLOAD] Downloaded file from S3 successfully (${fileBuffer.length} bytes)`);
    } catch (err: any) {
      console.error(`[PROCESS_UPLOAD] Failed to download file from S3 (Key: ${batch.objectKey}):`, err.message);
      throw new Error(`Failed to download file from S3 (Key: ${batch.objectKey}): ${err.message}`);
    }
  }

  const isCsv = batch.originalFileName.toLowerCase().endsWith('.csv');
  console.log(`[PROCESS_UPLOAD] Parsing spreadsheet buffer (format=${isCsv ? 'CSV' : 'Excel'}, size=${fileBuffer.length} bytes)...`);
  const parseResult = await parseSpreadsheetBuffer(fileBuffer, isCsv);
  console.log(`[PROCESS_UPLOAD] Parsed batch ${batchId}: totalRows=${parseResult.totalRows}, validRows=${parseResult.validRows}, invalidRows=${parseResult.invalidRows}, errors=${parseResult.errors.length}`);

  // Update batch progress
  await prisma.uploadBatch.update({
    where: { id: batchId },
    data: {
      rowCount: parseResult.totalRows,
      validRowCount: parseResult.validRows,
      invalidRowCount: parseResult.invalidRows,
      errorSummary: parseResult.errors.length > 0 ? (parseResult.errors as any) : null
    }
  });

  // Group valid records by (fcId, businessDate)
  const activeFcs = await prisma.fulfilmentCentre.findMany({
    where: { isActive: true }
  });
  const activeFcMap = new Map(activeFcs.map(f => [f.code, f.id]));

  const datesInBatch = new Set<string>();

  for (const record of parseResult.records) {
    datesInBatch.add(record.businessDate);

    // Resolve FC internal ID
    let resolvedFcId = activeFcMap.get(record.fcId);
    if (!resolvedFcId) {
      // Check by ID directly
      const fcById = activeFcs.find(f => f.id === record.fcId);
      if (fcById) resolvedFcId = fcById.id;
    }

    if (!resolvedFcId) {
      console.log(`[PROCESS_UPLOAD] Auto-registering new Fulfilment Centre code='${record.fcId}'...`);
      const newFc = await prisma.fulfilmentCentre.create({
        data: {
          code: record.fcId,
          name: `${record.fcId} Fulfilment Centre`,
          location: 'Auto Registered',
          currency: record.currency || 'INR',
          isActive: true
        }
      });
      activeFcMap.set(record.fcId, newFc.id);
      resolvedFcId = newFc.id;
    }

    const businessDateObj = new Date(record.businessDate);

    // Find highest version for this FC/Date
    const existingSubmissions = await prisma.dailySubmission.findMany({
      where: {
        fcId: resolvedFcId,
        businessDate: businessDateObj
      },
      orderBy: { version: 'desc' }
    });

    const nextVersion = existingSubmissions.length > 0 ? existingSubmissions[0]!.version + 1 : 1;

    // Transactionally update old versions, create new submission and schedule analysis
    await prisma.$transaction(async tx => {
      // Mark prior versions as isLatest = false
      await tx.dailySubmission.updateMany({
        where: {
          fcId: resolvedFcId,
          businessDate: businessDateObj,
          isLatest: true
        },
        data: { isLatest: false }
      });

      // Create new latest submission
      const newSubmission = await tx.dailySubmission.create({
        data: {
          batchId: batch.id,
          fcId: resolvedFcId,
          businessDate: businessDateObj,
          version: nextVersion,
          isLatest: true,
          status: SubmissionStatus.RECEIVED,
          sourceRowIndex: record.sourceRowIndex,
          rawInput: record as any,
          normalizedInput: record as any
        }
      });

      // Schedule ANALYZE_SUBMISSION job
      const idempotencyKey = `analyze-submission:${newSubmission.id}:1`;
      await tx.backgroundJob.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
          jobType: 'ANALYZE_SUBMISSION',
          payload: { submissionId: newSubmission.id },
          status: JobStatus.PENDING,
          priority: 5,
          idempotencyKey,
          maxAttempts: 3
        }
      });

      console.log(`[PROCESS_UPLOAD] Created DailySubmission id=${newSubmission.id} (FC=${record.fcId}, Date=${record.businessDate}, version=${nextVersion}) and queued ANALYZE_SUBMISSION job (${idempotencyKey})`);
    });
  }

  // Check for missing FCs for each date present in this batch (only in CENTRALIZED mode)
  if (batch.mode === 'CENTRALIZED') {
    const allActiveFcs = await prisma.fulfilmentCentre.findMany({ where: { isActive: true } });
    for (const dateStr of datesInBatch) {
      const businessDateObj = new Date(dateStr);
      for (const fc of allActiveFcs) {
        const existing = await prisma.dailySubmission.findFirst({
          where: {
            fcId: fc.id,
            businessDate: businessDateObj,
            isLatest: true
          }
        });

        if (!existing) {
          console.log(`[PROCESS_UPLOAD] Missing submission detected for FC=${fc.code} on Date=${dateStr}. Recording placeholder.`);
          // Record missing submission placeholder
          await prisma.dailySubmission.create({
            data: {
              batchId: batch.id,
              fcId: fc.id,
              businessDate: businessDateObj,
              version: 1,
              isLatest: true,
              status: SubmissionStatus.MISSING
            }
          });
        }
      }
    }
  }

  // Mark UploadBatch completed or partially failed
  const finalStatus =
    parseResult.invalidRows > 0 && parseResult.validRows > 0
      ? UploadBatchStatus.PARTIALLY_FAILED
      : parseResult.invalidRows > 0 && parseResult.validRows === 0
        ? UploadBatchStatus.FAILED
        : UploadBatchStatus.COMPLETED;

  await prisma.uploadBatch.update({
    where: { id: batchId },
    data: {
      status: finalStatus,
      completedAt: new Date()
    }
  });

  console.log(`[PROCESS_UPLOAD] Finished batchId=${batchId} with final status=${finalStatus} (valid=${parseResult.validRows}, invalid=${parseResult.invalidRows})`);

  return {
    batchId,
    status: finalStatus,
    validRows: parseResult.validRows,
    invalidRows: parseResult.invalidRows
  };
}
