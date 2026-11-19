import { PrismaClient, UploadBatchStatus, SubmissionStatus, JobStatus, DatasetType } from '@prisma/client';
import { parseSpreadsheetBuffer, parseOperationalWorkbookBuffer } from '@prozo/finance';
import { S3StorageService } from '../services/s3.service.js';

export async function handleProcessUpload(
  payload: { batchId: string },
  prisma: PrismaClient,
  s3Service: S3StorageService,
  mockFileBuffer?: Buffer // for testing without S3
) {
  if ((payload as any)?.test) {
    console.log(`[PROCESS_UPLOAD] Test probe job received. Skipping execution.`);
    return { status: 'SKIPPED_TEST' };
  }

  const { batchId } = payload || {};
  console.log(`[PROCESS_UPLOAD] Starting processing for batchId=${batchId}`);

  if (!batchId) {
    console.error(`[PROCESS_UPLOAD] Missing batchId in job payload:`, payload);
    throw new Error(`[PROCESS_UPLOAD] Invalid payload: 'batchId' is required and cannot be undefined`);
  }

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
  console.log(`[PROCESS_UPLOAD] Batch ${batchId} status updated to PROCESSING. DatasetType=${batch.datasetType}, Source file="${batch.originalFileName}"`);

  try {
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

  // Fetch uploader details to enforce FC Manager data isolation
  const uploader = await prisma.user.findUnique({
    where: { id: batch.uploadedById },
    include: {
      assignedFCs: {
        include: { fc: true }
      }
    }
  });

  const isFcManager = uploader?.role === 'FC_MANAGER';
  const allowedFcIds = new Set(uploader?.assignedFCs.map(a => a.fcId) || []);
  const allowedFcCodes = new Set(uploader?.assignedFCs.map(a => a.fc.code.toUpperCase()) || []);

  // Dispatch based on DatasetType:
  // Operational and Workforce Data Ingestion
  if (
    batch.datasetType === DatasetType.DAILY_OPERATIONS ||
    batch.datasetType === DatasetType.DAILY_LABOR ||
    batch.datasetType === DatasetType.COMBINED_OPERATIONS_LABOR
  ) {
    console.log(`[PROCESS_UPLOAD] Parsing operational/labor dataset (${batch.datasetType})...`);
    const parsedData = await parseOperationalWorkbookBuffer(fileBuffer, isCsv, batch.datasetType as any);

    const activeFcs = await prisma.fulfilmentCentre.findMany({ where: { isActive: true } });
    const activeFcMap = new Map(activeFcs.map(f => [f.code.toUpperCase(), f.id]));
    activeFcs.forEach(f => activeFcMap.set(f.id, f.id));

    let totalRows = 0;
    let totalValidRows = 0;
    let totalInvalidRows = 0;
    const allErrors: any[] = [];
    const modifiedFcDates = new Set<string>();

    // 1. Process Operations Records
    if (parsedData.operations) {
      totalRows += parsedData.operations.totalRows;
      allErrors.push(...parsedData.operations.errors);

      for (const op of parsedData.operations.records) {
        const opCode = op.fcId.toUpperCase().trim();
        if (isFcManager && !allowedFcCodes.has(opCode) && !allowedFcIds.has(op.fcId)) {
          allErrors.push({
            rowIndex: op.sourceRowIndex,
            fcId: op.fcId,
            field: 'fcId',
            message: `FC Manager ${uploader?.name} is not authorized to upload operational data for FC '${op.fcId}'`,
            rawValue: op.fcId
          });
          continue;
        }

        let resolvedFcId = activeFcMap.get(opCode) || activeFcMap.get(op.fcId);
        if (!resolvedFcId) {
          const newFc = await prisma.fulfilmentCentre.create({
            data: {
              code: op.fcId,
              name: `${op.fcId} Fulfilment Centre`,
              location: 'Auto Registered',
              currency: 'INR',
              isActive: true
            }
          });
          activeFcMap.set(op.fcId.toUpperCase(), newFc.id);
          resolvedFcId = newFc.id;
        }

        const bDate = new Date(op.businessDate);
        const existingVersions = await prisma.operationalDailyMetrics.findMany({
          where: { fcId: resolvedFcId, businessDate: bDate },
          orderBy: { version: 'desc' }
        });
        const nextVersion = existingVersions.length > 0 ? existingVersions[0]!.version + 1 : 1;

        await prisma.$transaction(async tx => {
          await tx.operationalDailyMetrics.updateMany({
            where: { fcId: resolvedFcId, businessDate: bDate, isLatest: true },
            data: { isLatest: false }
          });

          await tx.operationalDailyMetrics.create({
            data: {
              fcId: resolvedFcId,
              businessDate: bDate,
              inboundShipments: op.inboundShipments,
              outboundOrders: op.outboundOrders,
              unitsProcessed: op.unitsProcessed,
              orderLinesProcessed: op.orderLinesProcessed,
              returnsProcessed: op.returnsProcessed,
              operatingHours: op.operatingHours,
              storageOccupancyPct: op.storageOccupancyPct,
              sourceUploadId: batch.id,
              sourceRowIndex: op.sourceRowIndex,
              version: nextVersion,
              isLatest: true,
              uploadedById: batch.uploadedById
            }
          });
        });

        totalValidRows++;
        modifiedFcDates.add(`${resolvedFcId}::${op.businessDate}`);
      }
    }

    // 2. Process Labor Records
    if (parsedData.labor) {
      totalRows += parsedData.labor.totalRows;
      allErrors.push(...parsedData.labor.errors);

      for (const lab of parsedData.labor.records) {
        const labCode = lab.fcId.toUpperCase().trim();
        if (isFcManager && !allowedFcCodes.has(labCode) && !allowedFcIds.has(lab.fcId)) {
          allErrors.push({
            rowIndex: lab.sourceRowIndex,
            fcId: lab.fcId,
            field: 'fcId',
            message: `FC Manager ${uploader?.name} is not authorized to upload labor data for FC '${lab.fcId}'`,
            rawValue: lab.fcId
          });
          continue;
        }

        let resolvedFcId = activeFcMap.get(labCode) || activeFcMap.get(lab.fcId);
        if (!resolvedFcId) {
          const newFc = await prisma.fulfilmentCentre.create({
            data: {
              code: lab.fcId,
              name: `${lab.fcId} Fulfilment Centre`,
              location: 'Auto Registered',
              currency: 'INR',
              isActive: true
            }
          });
          activeFcMap.set(lab.fcId.toUpperCase(), newFc.id);
          resolvedFcId = newFc.id;
        }

        const bDate = new Date(lab.businessDate);
        const existingVersions = await prisma.workforceDailyMetrics.findMany({
          where: { fcId: resolvedFcId, businessDate: bDate },
          orderBy: { version: 'desc' }
        });
        const nextVersion = existingVersions.length > 0 ? existingVersions[0]!.version + 1 : 1;

        await prisma.$transaction(async tx => {
          await tx.workforceDailyMetrics.updateMany({
            where: { fcId: resolvedFcId, businessDate: bDate, isLatest: true },
            data: { isLatest: false }
          });

          await tx.workforceDailyMetrics.create({
            data: {
              fcId: resolvedFcId,
              businessDate: bDate,
              plannedHeadcount: lab.plannedHeadcount,
              actualHeadcount: lab.actualHeadcount,
              plannedLabourHours: lab.plannedLabourHours,
              actualPaidHours: lab.actualPaidHours,
              productiveHours: lab.productiveHours,
              overtimeHours: lab.overtimeHours,
              contractorHeadcount: lab.contractorHeadcount,
              contractorHours: lab.contractorHours,
              contractorCost: lab.contractorCost,
              sourceUploadId: batch.id,
              sourceRowIndex: lab.sourceRowIndex,
              version: nextVersion,
              isLatest: true,
              uploadedById: batch.uploadedById
            }
          });
        });

        totalValidRows++;
        modifiedFcDates.add(`${resolvedFcId}::${lab.businessDate}`);
      }
    }

    totalInvalidRows = allErrors.length;

    // 3. Reconcile FC/Date records: Trigger AI re-investigation when appropriate (Section 7 Case 2 & 3)
    console.log(`[PROCESS_UPLOAD] Checking for existing PnL submissions to trigger AI re-investigation for ${modifiedFcDates.size} FC/date combos...`);
    for (const key of modifiedFcDates) {
      const [fcId, dateStr] = key.split('::');
      if (!fcId || !dateStr) continue;

      const existingSubmission = await prisma.dailySubmission.findFirst({
        where: {
          fcId,
          businessDate: new Date(dateStr),
          isLatest: true,
          status: SubmissionStatus.COMPLETED
        },
        include: {
          pnl: {
            include: { anomalies: true }
          }
        }
      });

      if (existingSubmission && existingSubmission.pnl) {
        // Only allow AI investigation once all three files are present
        const [opsRecord, laborRecord] = await Promise.all([
          prisma.operationalDailyMetrics.findFirst({
            where: { fcId, businessDate: new Date(dateStr), isLatest: true }
          }),
          prisma.workforceDailyMetrics.findFirst({
            where: { fcId, businessDate: new Date(dateStr), isLatest: true }
          })
        ]);

        const hasAllThree = !!opsRecord && !!laborRecord;
        if (hasAllThree) {
          console.log(`[PROCESS_UPLOAD] All 3 files now present for FC=${fcId}, Date=${dateStr}. Ready for AI investigation via UI trigger button.`);
        } else {
          console.log(`[PROCESS_UPLOAD] AI investigation held for FC=${fcId}, Date=${dateStr}: awaiting all 3 files (hasOps=${!!opsRecord}, hasLabor=${!!laborRecord})`);
        }
      }
    }

    // Finalize batch
    const finalStatus =
      totalInvalidRows > 0 && totalValidRows > 0
        ? UploadBatchStatus.PARTIALLY_FAILED
        : totalInvalidRows > 0 && totalValidRows === 0
          ? UploadBatchStatus.FAILED
          : UploadBatchStatus.COMPLETED;

    await prisma.uploadBatch.update({
      where: { id: batchId },
      data: {
        status: finalStatus,
        rowCount: totalRows,
        validRowCount: totalValidRows,
        invalidRowCount: totalInvalidRows,
        errorSummary: allErrors.length > 0 ? (allErrors as any) : null,
        completedAt: new Date()
      }
    });

    console.log(`[PROCESS_UPLOAD] Finished operational batchId=${batchId} with final status=${finalStatus} (valid=${totalValidRows}, invalid=${totalInvalidRows})`);

    return {
      batchId,
      status: finalStatus,
      validRows: totalValidRows,
      invalidRows: totalInvalidRows
    };
  }

  // Standard PnL Ingestion Flow
  console.log(`[PROCESS_UPLOAD] Parsing spreadsheet buffer for P&L data (format=${isCsv ? 'CSV' : 'Excel'}, size=${fileBuffer.length} bytes)...`);
  const parseResult = await parseSpreadsheetBuffer(fileBuffer, isCsv);
  console.log(`[PROCESS_UPLOAD] Parsed batch ${batchId}: totalRows=${parseResult.totalRows}, validRows=${parseResult.validRows}, invalidRows=${parseResult.invalidRows}, errors=${parseResult.errors.length}`);

  // Filter out any rows for FCs that the manager is not authorized to submit
  const authorizedRecords = [];
  const unauthorizedErrors = [];

  for (const record of parseResult.records) {
    if (isFcManager) {
      const recordCode = record.fcId.toUpperCase().trim();
      const isAllowed = allowedFcCodes.has(recordCode) || allowedFcIds.has(record.fcId);
      if (!isAllowed) {
        unauthorizedErrors.push({
          rowIndex: record.sourceRowIndex,
          fcId: record.fcId,
          field: 'fcId',
          message: `FC Manager ${uploader?.name} is not authorized to upload data for FC '${record.fcId}'. Only authorized for: ${[...allowedFcCodes].join(', ')}`,
          rawValue: record.fcId
        });
        continue;
      }
    }
    authorizedRecords.push(record);
  }

  const allErrors = [...parseResult.errors, ...unauthorizedErrors];
  const totalValidRows = authorizedRecords.length;
  const totalInvalidRows = parseResult.invalidRows + unauthorizedErrors.length;

  // Update batch progress with error summaries
  await prisma.uploadBatch.update({
    where: { id: batchId },
    data: {
      rowCount: parseResult.totalRows,
      validRowCount: totalValidRows,
      invalidRowCount: totalInvalidRows,
      errorSummary: allErrors.length > 0 ? (allErrors as any) : null
    }
  });

  // Group valid records by (fcId, businessDate)
  const activeFcs = await prisma.fulfilmentCentre.findMany({
    where: { isActive: true }
  });
  const activeFcMap = new Map(activeFcs.map(f => [f.code, f.id]));

  const datesInBatch = new Set<string>();

  for (const record of authorizedRecords) {
    datesInBatch.add(record.businessDate);

    // Resolve FC internal ID
    let resolvedFcId = activeFcMap.get(record.fcId);
    if (!resolvedFcId) {
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
    totalInvalidRows > 0 && totalValidRows > 0
      ? UploadBatchStatus.PARTIALLY_FAILED
      : totalInvalidRows > 0 && totalValidRows === 0
        ? UploadBatchStatus.FAILED
        : UploadBatchStatus.COMPLETED;

  await prisma.uploadBatch.update({
    where: { id: batchId },
    data: {
      status: finalStatus,
      completedAt: new Date()
    }
  });

  console.log(`[PROCESS_UPLOAD] Finished batchId=${batchId} with final status=${finalStatus} (valid=${totalValidRows}, invalid=${totalInvalidRows})`);

  return {
    batchId,
    status: finalStatus,
    validRows: totalValidRows,
    invalidRows: totalInvalidRows
  };
} catch (err: any) {
  console.error(`[PROCESS_UPLOAD] Error processing batchId=${batchId}:`, err);
  await prisma.uploadBatch.update({
    where: { id: batchId },
    data: {
      status: UploadBatchStatus.FAILED,
      errorSummary: [{ message: err.message || 'Processing failed' }],
      completedAt: new Date()
    }
  }).catch(updateErr => console.error(`[PROCESS_UPLOAD] Failed to mark uploadBatch FAILED:`, updateErr));
  throw err;
}
}
