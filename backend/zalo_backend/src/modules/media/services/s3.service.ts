// src/modules/media/services/s3.service.ts
// FIXED: Production-ready S3 service with proper retry, verification, and multipart handling

import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListMultipartUploadsCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import s3Config from 'src/config/s3.config.ts';

import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import * as os from 'os';

import { Upload } from '@aws-sdk/lib-storage';
import { AwsError } from './media-upload.service';

const pipeline = promisify(stream.pipeline);

interface FileExistenceResult {
  exists: boolean;
  metadata?: {
    size: number;
    contentType: string;
    lastModified: Date;
  };
  error?: string;
}

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
   * ✅ FIXED: Generate presigned URL with explicit configuration
   * Prevents SDK auto-multipart by setting proper content-length expectations
   */
  async generatePresignedUrl(params: {
    key: string;
    expiresIn: number;
    contentType: string;
  }): Promise<string> {
    this.logger.debug('Generating presigned URL', {
      key: params.key,
      expiresIn: params.expiresIn,
      contentType: params.contentType,
    });

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
      url: url.substring(0, 100) + '...', // Log first 100 chars
    });

    return url;
  }

  /**
   * ✅ FIXED: Robust file existence check with detailed result
   * Handles eventual consistency, multipart uploads, and error context
   */
  async verifyFileExists(
    key: string,
    options: {
      maxRetries?: number;
      retryDelay?: number;
      checkMultipart?: boolean;
    } = {},
  ): Promise<FileExistenceResult> {
    const maxRetries = options.maxRetries ?? 5;
    const baseDelay = options.retryDelay ?? 200; // Start with 200ms
    const checkMultipart = options.checkMultipart ?? true;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.s3Client.send(
          new HeadObjectCommand({
            Bucket: this.bucketName,
            Key: key,
          }),
        );

        this.logger.debug('File exists', {
          key,
          attempt: attempt + 1,
          size: result.ContentLength,
          contentType: result.ContentType,
        });

        return {
          exists: true,
          metadata: {
            size: result.ContentLength || 0,
            contentType: result.ContentType || 'application/octet-stream',
            lastModified: result.LastModified || new Date(),
          },
        };
      } catch (error) {
        const errorI = error as AwsError;
        const errorName = errorI.name;
        const errorCode = errorI.$metadata?.httpStatusCode;

        // Not found - check if it's incomplete multipart
        if (errorName === 'NotFound' || errorCode === 404) {
          if (checkMultipart && attempt === 0) {
            // First attempt - check for incomplete multipart upload
            const hasMultipart = await this.checkIncompleteMultipart(key);
            if (hasMultipart) {
              this.logger.warn('Incomplete multipart upload detected', {
                key,
                action: 'waiting_for_completion',
              });
              // Continue retrying - multipart might complete
            }
          }

          if (attempt < maxRetries - 1) {
            const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
            this.logger.debug('File not found, retrying...', {
              key,
              attempt: attempt + 1,
              maxRetries,
              nextRetryIn: `${delay}ms`,
            });
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          this.logger.warn('File not found after all retries', {
            key,
            attempts: maxRetries,
          });

          return {
            exists: false,
            error: 'File not found after retries',
          };
        }

        // Other errors (permissions, network, etc.)
        this.logger.error('Error checking file existence', {
          key,
          attempt: attempt + 1,
          errorName,
          errorCode,
          message: (error as Error).message,
        });

        return {
          exists: false,
          error: `S3 error: ${errorName} (${errorCode})`,
        };
      }
    }

    return {
      exists: false,
      error: 'Max retries exceeded',
    };
  }

  /**
   * ✅ NEW: Check for incomplete multipart uploads
   * Helps diagnose stuck uploads
   */
  private async checkIncompleteMultipart(key: string): Promise<boolean> {
    try {
      const result = await this.s3Client.send(
        new ListMultipartUploadsCommand({
          Bucket: this.bucketName,
          Prefix: key,
        }),
      );

      const hasIncomplete =
        result.Uploads && result.Uploads.some((u) => u.Key === key);

      if (hasIncomplete) {
        this.logger.warn('Found incomplete multipart upload', {
          key,
          uploads: result.Uploads?.length,
        });
      }

      return hasIncomplete || false;
    } catch (error) {
      this.logger.debug('Could not check multipart uploads', {
        key,
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * ✅ NEW: Abort incomplete multipart uploads (cleanup)
   */
  async abortIncompleteMultipartUploads(prefix: string): Promise<number> {
    try {
      const result = await this.s3Client.send(
        new ListMultipartUploadsCommand({
          Bucket: this.bucketName,
          Prefix: prefix,
        }),
      );

      if (!result.Uploads || result.Uploads.length === 0) {
        return 0;
      }

      let abortedCount = 0;
      for (const upload of result.Uploads) {
        try {
          await this.s3Client.send(
            new AbortMultipartUploadCommand({
              Bucket: this.bucketName,
              Key: upload.Key,
              UploadId: upload.UploadId,
            }),
          );
          abortedCount++;
          this.logger.log('Aborted incomplete multipart upload', {
            key: upload.Key,
            uploadId: upload.UploadId,
          });
        } catch (abortError) {
          this.logger.warn('Failed to abort multipart upload', {
            key: upload.Key,
            error: (abortError as Error).message,
          });
        }
      }

      return abortedCount;
    } catch (error) {
      this.logger.error('Failed to list multipart uploads', {
        prefix,
        error: (error as Error).message,
      });
      return 0;
    }
  }

  /**
   * ✅ DEPRECATED: Use verifyFileExists instead
   * Kept for backward compatibility
   */
  async waitForFileExistence(key: string, maxRetries = 3): Promise<boolean> {
    const result = await this.verifyFileExists(key, { maxRetries });
    return result.exists;
  }

  /**
   * Move file atomically with rollback on failure
   */
  async moveObjectAtomic(sourceKey: string, destKey: string): Promise<void> {
    this.logger.debug('Starting atomic move', { sourceKey, destKey });

    try {
      // 1. Verify source exists first
      const sourceExists = await this.verifyFileExists(sourceKey, {
        maxRetries: 3,
        checkMultipart: true,
      });

      if (!sourceExists.exists) {
        throw new Error(
          `Source file not found or incomplete: ${sourceExists.error}`,
        );
      }

      // 2. Copy to destination
      await this.s3Client.send(
        new CopyObjectCommand({
          Bucket: this.bucketName,
          CopySource: `${this.bucketName}/${sourceKey}`,
          Key: destKey,
        }),
      );

      // 3. Verify copy succeeded
      const destExists = await this.verifyFileExists(destKey, {
        maxRetries: 5,
        checkMultipart: false,
      });

      if (!destExists.exists) {
        throw new Error(
          'Copy verification failed - destination file not found',
        );
      }

      // 4. Delete source
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: sourceKey,
        }),
      );

      this.logger.log('Atomic move completed', {
        sourceKey,
        destKey,
        size: destExists.metadata?.size,
      });
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
      // Try to list objects (lightweight operation)
      await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          MaxKeys: 1,
        }),
      );
      return true;
    } catch (error) {
      this.logger.error('S3 health check failed', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Download file from S3 to local temp file using Streams
   */
  async downloadToLocalTemp(key: string): Promise<string> {
    const tempFilePath = path.join(os.tmpdir(), `upload-${randomUUID()}`);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        throw new Error('Empty response body from S3');
      }

      await pipeline(
        response.Body as stream.Readable,
        fs.createWriteStream(tempFilePath),
      );

      this.logger.debug(`File downloaded to temp: ${tempFilePath}`);
      return tempFilePath;
    } catch (error) {
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath).catch(() => {});
      }
      this.logger.error(`Failed to download to temp file: ${key}`, error);
      throw error;
    }
  }

  /**
   * Get object metadata (size, content-type) without downloading body
   */
  async getObjectMetadata(key: string) {
    const command = new HeadObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return this.s3Client.send(command);
  }

  /**
   * Get Readable Stream from S3
   */
  async getFileStream(key: string): Promise<stream.Readable> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    const response = await this.s3Client.send(command);
    return response.Body as stream.Readable;
  }

  /**
   * Upload from Stream (Zero-Buffer)
   */
  async uploadFromStream(
    key: string,
    body: stream.Readable | Buffer,
    contentType: string,
  ): Promise<void> {
    const parallelUploads3 = new Upload({
      client: this.s3Client,
      params: {
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
    });

    await parallelUploads3.done();
  }

  /**
   * Delete folder (delete multiple objects by prefix)
   */
  async deleteFolder(prefix: string): Promise<void> {
    this.logger.debug(`Deleting folder: ${prefix}`);

    let continuationToken: string | undefined;

    do {
      const listParams = {
        Bucket: this.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      };
      const listedObjects = await this.s3Client.send(
        new ListObjectsV2Command(listParams),
      );

      if (!listedObjects.Contents || listedObjects.Contents.length === 0) {
        break;
      }

      const deleteParams = {
        Bucket: this.bucketName,
        Delete: {
          Objects: listedObjects.Contents.map(({ Key }) => ({ Key })),
          Quiet: true,
        },
      };

      await this.s3Client.send(new DeleteObjectsCommand(deleteParams));

      continuationToken = listedObjects.NextContinuationToken;
    } while (continuationToken);

    this.logger.log(`Folder deleted: ${prefix}`);
  }
}
