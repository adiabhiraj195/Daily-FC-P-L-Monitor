import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

export interface S3ServiceConfig {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  presignedUrlTtlSeconds?: number;
}

export class S3StorageService {
  private client: S3Client;
  private bucket: string;
  private presignedTtl: number;

  constructor(config: S3ServiceConfig) {
    this.bucket = config.bucket;
    this.presignedTtl = config.presignedUrlTtlSeconds || 600;

    const credentials =
      config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey
          }
        : undefined;

    const endpoint = config.endpoint && config.endpoint.trim() !== '' ? config.endpoint.trim() : undefined;

    this.client = new S3Client({
      region: config.region,
      endpoint,
      forcePathStyle: Boolean(config.forcePathStyle),
      credentials
    });
  }

  /**
   * Generates a safe, unique object key:
   * uploads/{userId}/{batchId}/{uuid}.{ext}
   */
  generateObjectKey(userId: string, batchId: string, originalFileName: string): string {
    const ext = originalFileName.split('.').pop()?.toLowerCase() || 'bin';
    const uniqueId = crypto.randomUUID();
    // Sanitize any path traversal characters
    const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeBatchId = batchId.replace(/[^a-zA-Z0-9_-]/g, '');
    return `uploads/${safeUserId}/${safeBatchId}/${uniqueId}.${ext}`;
  }

  /**
   * Generates a short-lived presigned PUT URL for direct browser-to-S3 upload.
   */
  async createPresignedUploadUrl(
    objectKey: string,
    contentType: string
  ): Promise<{ uploadUrl: string; expiresInSeconds: number }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: contentType
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.presignedTtl
    });

    return {
      uploadUrl,
      expiresInSeconds: this.presignedTtl
    };
  }

  /**
   * Verifies uploaded object metadata using HeadObject
   */
  async verifyObject(objectKey: string): Promise<{ size: number; contentType?: string }> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: objectKey
    });

    const response = await this.client.send(command);
    const size = response.ContentLength || 0;

    if (size <= 0) {
      throw new Error(`Uploaded file is empty (0 bytes) for key ${objectKey}`);
    }

    return {
      size,
      contentType: response.ContentType
    };
  }

  /**
   * Downloads object bytes as a Buffer
   */
  async downloadObject(objectKey: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`Empty body received from S3 for key ${objectKey}`);
    }

    // Convert stream to Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  getBucketName(): string {
    return this.bucket;
  }
}
