import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { initiateUploadRequestSchema } from '@prozo/shared';
import { authenticate } from '../../middleware/auth.js';
import { S3StorageService } from '../../services/s3.service.js';
import { UploadsService } from './uploads.service.js';
import { config } from '../../config/index.js';

const prisma = new PrismaClient();
const s3Service = new S3StorageService({
  region: config.AWS_REGION,
  bucket: config.AWS_S3_BUCKET,
  accessKeyId: config.AWS_ACCESS_KEY_ID,
  secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  endpoint: config.AWS_S3_ENDPOINT,
  forcePathStyle: config.AWS_S3_FORCE_PATH_STYLE,
  presignedUrlTtlSeconds: config.S3_PRESIGNED_URL_TTL_SECONDS
});
const uploadsService = new UploadsService(prisma, s3Service, config.MAX_UPLOAD_SIZE_BYTES);

export const uploadsRouter = Router();

// Only ADMIN and FINANCE (or FC_MANAGER for single FC mode) can initiate
uploadsRouter.post(
  '/initiate',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = initiateUploadRequestSchema.parse(req.body);

      // Single FC mode check
      if (parsed.mode === 'SINGLE_FC') {
        if (!parsed.fcId) {
          res.status(400).json({ error: 'fcId is required for SINGLE_FC upload mode' });
          return;
        }
        if (req.user!.role === UserRole.FC_MANAGER && !req.user!.assignedFcIds.includes(parsed.fcId)) {
          res.status(403).json({ error: `Forbidden: not authorized to upload for FC '${parsed.fcId}'` });
          return;
        }
      } else {
        // Centralized mode requires ADMIN or FINANCE
        if (req.user!.role === UserRole.FC_MANAGER) {
          res.status(403).json({ error: 'Forbidden: FC Managers can only upload in SINGLE_FC mode' });
          return;
        }
      }

      const result = await uploadsService.initiateUpload({
        userId: req.user!.id,
        fileName: parsed.fileName,
        contentType: parsed.contentType,
        fileSize: parsed.fileSize,
        mode: parsed.mode,
        fcId: parsed.fcId
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

uploadsRouter.post(
  '/:batchId/complete',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const batchId = String(req.params.batchId);
      const skipS3HeadCheck = req.query.skipHeadCheck === 'true'; // allows testing without active S3
      const result = await uploadsService.completeUpload(batchId, req.user!.id, skipS3HeadCheck);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

uploadsRouter.get(
  '/:batchId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const batchId = String(req.params.batchId);
      const batch = await uploadsService.getBatch(batchId);
      res.json(batch);
    } catch (err) {
      next(err);
    }
  }
);
