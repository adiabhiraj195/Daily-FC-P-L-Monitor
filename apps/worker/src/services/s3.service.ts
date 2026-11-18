import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand
} from '@aws-sdk/client-s3';

export interface S3ServiceConfig {
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

export class S3StorageService {
  private client: S3Client;
  private bucket: string;

  constructor(config: S3ServiceConfig) {
    this.bucket = config.bucket;

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

  async downloadObject(objectKey: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`Empty body received from S3 for key ${objectKey}`);
    }

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
