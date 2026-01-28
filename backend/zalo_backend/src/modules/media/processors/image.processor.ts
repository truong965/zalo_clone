// src/modules/media/processors/image.processor.ts
import { Injectable, Logger } from '@nestjs/common';
import { S3Service } from '../services/s3.service';
import * as path from 'path';
import sharp, { OutputInfo } from 'sharp';
export interface ImageProcessingResult {
  thumbnail: {
    s3Key: string;
    width: number;
    height: number;
    size: number;
  };
  optimized?: {
    s3Key: string;
    width: number;
    height: number;
    size: number;
  };
}

export interface ImageProcessingJob {
  mediaId: string;
  s3Key: string;
  originalWidth: number;
  originalHeight: number;
}

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  // Thumbnail sizes (responsive breakpoints)
  private readonly THUMBNAIL_SIZES = {
    small: { width: 150, height: 150 }, // Chat preview
    medium: { width: 480, height: 480 }, // Mobile view
    large: { width: 1024, height: 1024 }, // Desktop lightbox
  };

  // Max dimension for optimized version
  private readonly MAX_OPTIMIZED_DIMENSION = 2048;

  constructor(private readonly s3Service: S3Service) {
    sharp.cache(false); // ✅ Tắt cache để tránh leak RAM trong container
    sharp.simd(true); // ✅ Bật SIMD để xử lý nhanh hơn
  }

  /**
   * Main processing function - generates thumbnails + optimized version
   */
  async processImage(job: ImageProcessingJob): Promise<ImageProcessingResult> {
    const { mediaId, s3Key, originalWidth, originalHeight } = job;
    // const tempFilePath: string | null = null;

    try {
      this.logger.log(`Starting image processing: ${mediaId}`);

      const thumbnailKey = this.generateProcessedKey(
        s3Key,
        'thumbnail',
        'webp',
      );

      const thumbnailMeta = await this.processStreamVariant(
        s3Key,
        thumbnailKey,
        {
          width: this.THUMBNAIL_SIZES.small.width,
          height: this.THUMBNAIL_SIZES.small.height,
          fit: 'cover', // Thumbnail thì crop cho đẹp
          quality: 80,
        },
      );

      // 3. Generate optimized version if original is too large
      let optimized: ImageProcessingResult['optimized'] = undefined;
      const needsOptimization =
        originalWidth > this.MAX_OPTIMIZED_DIMENSION ||
        originalHeight > this.MAX_OPTIMIZED_DIMENSION;

      if (needsOptimization) {
        const optimizedKey = this.generateProcessedKey(
          s3Key,
          'optimized',
          'webp',
        );
        // Gọi stream lần 2 (Chấp nhận tải lại từ S3 để tiết kiệm RAM server)
        const optimizedMeta = await this.processStreamVariant(
          s3Key,
          optimizedKey,
          {
            width: this.MAX_OPTIMIZED_DIMENSION,
            height: this.MAX_OPTIMIZED_DIMENSION,
            fit: 'inside', // Optimized thì giữ nguyên tỷ lệ
            quality: 85,
          },
        );

        optimized = { s3Key: optimizedKey, ...optimizedMeta };
      }

      this.logger.log(`Image processing completed: ${mediaId}`, {
        thumbnail: thumbnailKey,
        optimized: optimized?.s3Key,
      });

      return {
        thumbnail: { s3Key: thumbnailKey, ...thumbnailMeta },
        optimized,
      };
    } catch (error) {
      this.logger.error(`Image processing failed: ${mediaId}`, error);
      throw error;
    }
  }

  /**
   * Helper xử lý Stream tổng quát
   * Thay thế cho cả generateThumbnail và generateOptimized cũ
   */
  private async processStreamVariant(
    inputKey: string,
    outputKey: string,
    options: {
      width: number;
      height: number;
      quality: number;
      fit: keyof sharp.FitEnum;
    },
  ) {
    // 1. Get Stream từ S3 (Không tốn RAM chứa file gốc)
    const inputStream = await this.s3Service.getFileStream(inputKey);

    // 2. Setup Sharp Pipeline
    const pipeline = sharp();

    // Config resize
    pipeline
      .resize(options.width, options.height, {
        fit: options.fit,
        withoutEnlargement: true,
      })
      .webp({ quality: options.quality });

    inputStream.on('error', (err) => {
      this.logger.error(`InputStream Error: ${err.message}`);
      pipeline.destroy(err); // Hủy pipeline nếu input lỗi
    });

    // 3. Capture metadata từ Sharp event (Để không cần load lại file check size)
    let processedMeta: { width: number; height: number; size: number } = {
      width: 0,
      height: 0,
      size: 0,
    };

    pipeline.on('info', (info: OutputInfo) => {
      processedMeta = {
        width: info.width,
        height: info.height,
        size: info.size, // Sharp trả về size chính xác sau khi nén
      };
    });

    // 4. Pipe: S3 Input -> Sharp -> S3 Output
    inputStream.pipe(pipeline);

    // Upload stream output lên S3
    await this.s3Service.uploadFromStream(outputKey, pipeline, 'image/webp');

    // Trả về metadata đã capture được
    return processedMeta;
  }

  /**
   * Generate S3 key for processed versions
   * Example: permanent/2025/01/abc123.jpg -> permanent/2025/01/abc123-thumbnail.webp
   */
  private generateProcessedKey(
    originalKey: string,
    variant: 'thumbnail' | 'optimized',
    extension: string,
  ): string {
    const parsed = path.parse(originalKey);
    return `${parsed.dir}/${parsed.name}-${variant}.${extension}`;
  }

  /**
   * Validate Sharp installation and WASM support
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Create 1x1 pixel test image
      const buffer = await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
        .png()
        .toBuffer();

      return buffer.length > 0;
    } catch (error) {
      this.logger.error('Sharp health check failed', error);
      return false;
    }
  }
}
