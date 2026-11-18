import { PrismaClient, UploadMode, UploadBatchStatus, JobStatus } from '@prisma/client';
import { S3StorageService } from '../../services/s3.service.js';
import crypto from 'crypto';

export class UploadsService {
  constructor(
    private prisma: PrismaClient,
    private s3Service: S3StorageService,
    private maxSizeBytes = 25_000_000
  ) {}

  async initiateUpload(input: {
    userId: string;
    fileName: string;
    contentType: string;
    fileSize: number;
    mode: UploadMode;
    fcId?: string;
  }) {
    console.log(`[UploadService:Initiate] Initiating upload for file="${input.fileName}" (size=${input.fileSize} bytes, mode=${input.mode}, userId=${input.userId}, fcId=${input.fcId || 'N/A'})`);

    // Validate format
    const lowerName = input.fileName.toLowerCase();
    const isAllowedExt = lowerName.endsWith('.xlsx') || lowerName.endsWith('.csv') || lowerName.endsWith('.xls');
    if (!isAllowedExt) {
      console.warn(`[UploadService:Initiate] Rejected upload: unsupported extension for file="${input.fileName}"`);
      throw new Error('Unsupported file format. Only .xlsx and .csv files are supported.');
    }

    if (input.fileSize <= 0) {
      console.warn(`[UploadService:Initiate] Rejected upload: invalid size (${input.fileSize} bytes)`);
      throw new Error('File size must be greater than 0 bytes.');
    }

    if (input.fileSize > this.maxSizeBytes) {
      console.warn(`[UploadService:Initiate] Rejected upload: file size (${input.fileSize} bytes) exceeds limit of ${this.maxSizeBytes} bytes`);
      throw new Error(`File size (${input.fileSize} bytes) exceeds maximum limit of ${this.maxSizeBytes} bytes.`);
    }

    const batchId = crypto.randomUUID();
    const objectKey = this.s3Service.generateObjectKey(input.userId, batchId, input.fileName);

    // Create UploadBatch in DB
    const batch = await this.prisma.uploadBatch.create({
      data: {
        id: batchId,
        uploadedById: input.userId,
        mode: input.mode,
        originalFileName: input.fileName,
        bucket: this.s3Service.getBucketName(),
        objectKey,
        contentType: input.contentType,
        fileSize: input.fileSize,
        status: UploadBatchStatus.INITIATED
      }
    });

    console.log(`[UploadService:Initiate] Created UploadBatch record: batchId=${batch.id}, objectKey=${objectKey}`);

    const { uploadUrl, expiresInSeconds } = await this.s3Service.createPresignedUploadUrl(
      objectKey,
      input.contentType
    );

    console.log(`[UploadService:Initiate] Generated S3 presigned URL for batchId=${batch.id} (expires in ${expiresInSeconds}s)`);

    return {
      batchId: batch.id,
      uploadUrl,
      objectKey,
      expiresInSeconds,
      headers: {
        'Content-Type': input.contentType
      }
    };
  }

  async completeUpload(batchId: string, _userId: string, skipS3HeadCheck = false) {
    console.log(`[UploadService:Complete] Completing upload: batchId=${batchId}, skipS3HeadCheck=${skipS3HeadCheck}`);

    const batch = await this.prisma.uploadBatch.findUnique({
      where: { id: batchId }
    });

    if (!batch) {
      console.warn(`[UploadService:Complete] Batch not found: batchId=${batchId}`);
      throw new Error(`Upload batch '${batchId}' not found.`);
    }

    // Idempotent check
    if (batch.status === UploadBatchStatus.UPLOADED || batch.status === UploadBatchStatus.PROCESSING || batch.status === UploadBatchStatus.COMPLETED) {
      console.log(`[UploadService:Complete] Batch already completed: batchId=${batch.id}, currentStatus=${batch.status}`);
      return {
        batchId: batch.id,
        status: batch.status,
        message: 'Upload already completed.'
      };
    }

    if (batch.status !== UploadBatchStatus.INITIATED) {
      console.warn(`[UploadService:Complete] Invalid status transition for batchId=${batch.id}, status=${batch.status}`);
      throw new Error(`Cannot complete batch with status '${batch.status}'.`);
    }

    // Verify object in S3 unless skipped (for mock tests)
    let verifiedSize = batch.fileSize;
    if (!skipS3HeadCheck) {
      try {
        console.log(`[UploadService:Complete] Verifying S3 object in bucket: key=${batch.objectKey}`);
        const metadata = await this.s3Service.verifyObject(batch.objectKey);
        verifiedSize = metadata.size;
        console.log(`[UploadService:Complete] S3 object verified: key=${batch.objectKey}, verifiedSize=${verifiedSize} bytes`);
      } catch (err: any) {
        console.error(`[UploadService:Complete] S3 verification failed for key=${batch.objectKey}:`, err.message);
        throw new Error(`S3 object verification failed: ${err.message}`);
      }
    }

    const idempotencyKey = `process-upload:${batch.id}`;

    // Transactional state update + durable BackgroundJob insertion
    const [updatedBatch] = await this.prisma.$transaction([
      this.prisma.uploadBatch.update({
        where: { id: batch.id },
        data: {
          status: UploadBatchStatus.UPLOADED,
          fileSize: verifiedSize
        }
      }),
      this.prisma.backgroundJob.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
          jobType: 'PROCESS_UPLOAD',
          payload: { batchId: batch.id },
          status: JobStatus.PENDING,
          priority: 10,
          idempotencyKey,
          maxAttempts: 3
        }
      })
    ]);

    console.log(`[UploadService:Complete] UploadBatch marked UPLOADED & queued PROCESS_UPLOAD background job: batchId=${updatedBatch.id}, idempotencyKey=${idempotencyKey}`);

    return {
      batchId: updatedBatch.id,
      status: updatedBatch.status,
      message: 'Upload verified and queued for processing'
    };
  }

  async getBatch(batchId: string) {
    const batch = await this.prisma.uploadBatch.findUnique({
      where: { id: batchId },
      include: {
        submissions: {
          select: {
            id: true,
            fcId: true,
            businessDate: true,
            status: true,
            isLatest: true,
            version: true
          }
        }
      }
    });

    if (!batch) {
      throw new Error(`Upload batch '${batchId}' not found.`);
    }

    return batch;
  }
}
