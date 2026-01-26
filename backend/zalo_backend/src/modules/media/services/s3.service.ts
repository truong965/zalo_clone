// src/modules/media/services/s3.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import s3Config from 'src/config/s3.config.ts';
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly cloudFrontDomain: string;

  constructor(
    @Inject(s3Config.KEY)
    private readonly config: ConfigType<typeof s3Config>,
  ) {
    this.s3Client = new S3Client({
      region: this.config.region,
      endpoint: this.config.endpoint,
      forcePathStyle: this.config.forcePathStyle,
      credentials: this.config.credentials,
    });

    this.bucketName = this.config.bucketName;
    this.cloudFrontDomain = this.config.cloudFront.domain;

    this.logger.log(
      `S3 Service initialized - Bucket: ${this.bucketName}, Endpoint: ${this.config.endpoint || 'AWS S3'}`,
    );
  }

  /**
   * Generate presigned URL for PUT upload
   */
  async generatePresignedUrl(params: {
    key: string;
    expiresIn: number;
    contentType: string;
  }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: params.key,
      ContentType: params.contentType,
    });

    const url = await getSignedUrl(this.s3Client, command, {
      expiresIn: params.expiresIn,
    });

    this.logger.debug('Presigned URL generated', {
      key: params.key,
      expiresIn: params.expiresIn,
    });

    return url;
  }

  /**
   * Check if file exists with retry for eventual consistency
   */
  async waitForFileExistence(key: string, maxRetries = 3): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.s3Client.send(
          new HeadObjectCommand({
            Bucket: this.bucketName,
            Key: key,
          }),
        );
        this.logger.debug('File exists', { key, attempt: i + 1 });
        return true;
      } catch (error) {
        if ((error as Error).name === 'NotFound') {
          if (i < maxRetries - 1) {
            const delay = Math.pow(2, i) * 100; // 100ms, 200ms, 400ms
            this.logger.debug('File not found, retrying...', {
              key,
              attempt: i + 1,
              delay,
            });
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          this.logger.warn('File not found after retries', { key, maxRetries });
          return false;
        }
        this.logger.error('Error checking file existence', {
          key,
          error: (error as Error).message,
        });
        throw error;
      }
    }
    return false;
  }

  /**
   * Move file atomically with rollback on failure
   */
  async moveObjectAtomic(sourceKey: string, destKey: string): Promise<void> {
    this.logger.debug('Starting atomic move', { sourceKey, destKey });

    try {
      // 1. Copy to destination
      await this.s3Client.send(
        new CopyObjectCommand({
          Bucket: this.bucketName,
          CopySource: `${this.bucketName}/${sourceKey}`,
          Key: destKey,
        }),
      );

      // 2. Verify copy succeeded
      const exists = await this.waitForFileExistence(destKey, 3);
      if (!exists) {
        throw new Error(
          'Copy verification failed - destination file not found',
        );
      }

      // 3. Delete source
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: sourceKey,
        }),
      );

      this.logger.log('Atomic move completed', { sourceKey, destKey });
    } catch (error: any) {
      this.logger.error('Atomic move failed, attempting rollback', {
        sourceKey,
        destKey,
        error: (error as Error).message,
      });

      // Rollback: delete destination if exists
      try {
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: destKey,
          }),
        );
        this.logger.debug('Rollback successful - deleted destination', {
          destKey,
        });
      } catch (rollbackError) {
        this.logger.error('Rollback failed', {
          destKey,
          error: (rollbackError as Error).message,
        });
      }

      throw new Error(`Atomic move failed: ${(error as Error).message}`);
    }
  }

  /**
   * Download file
   */
  async downloadFile(key: string): Promise<Buffer> {
    this.logger.debug('Downloading file', { key });

    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );

    const buffer = Buffer.from(await response.Body!.transformToByteArray());

    this.logger.debug('File downloaded', { key, size: buffer.length });

    return buffer;
  }

  /**
   * Download partial file (for magic number validation)
   */
  async downloadPartial(
    key: string,
    start: number,
    end: number,
  ): Promise<Buffer> {
    this.logger.debug('Downloading partial file', { key, start, end });

    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Range: `bytes=${start}-${end}`,
      }),
    );

    const buffer = Buffer.from(await response.Body!.transformToByteArray());

    this.logger.debug('Partial file downloaded', {
      key,
      size: buffer.length,
    });

    return buffer;
  }

  /**
   * Upload file
   */
  async uploadFile(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    this.logger.debug('Uploading file', { key, size: buffer.length });

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    this.logger.log('File uploaded', { key, size: buffer.length });
  }

  /**
   * Delete file
   */
  async deleteFile(key: string): Promise<void> {
    this.logger.debug('Deleting file', { key });

    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );

    this.logger.log('File deleted', { key });
  }

  /**
   * Get CloudFront URL or fallback to S3 URL
   */
  getCloudFrontUrl(key: string): string {
    if (this.cloudFrontDomain) {
      return `https://${this.cloudFrontDomain}/${key}`;
    }

    // Fallback to S3 URL (dev/test with MinIO)
    if (this.config.endpoint) {
      return `${this.config.endpoint}/${this.bucketName}/${key}`;
    }

    // AWS S3 URL
    return `https://${this.bucketName}.s3.${this.config.region}.amazonaws.com/${key}`;
  }

  /**
   * Get bucket name
   */
  getBucketName(): string {
    return this.bucketName;
  }

  /**
   * Health check
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Try to head the bucket itself
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: '.health-check',
        }),
      );
      return true;
    } catch (error) {
      if ((error as Error).name === 'NotFound') {
        // Bucket exists, file doesn't - that's OK
        return true;
      }
      this.logger.error('S3 health check failed', {
        error: (error as Error).message,
      });
      return false;
    }
  }
}
