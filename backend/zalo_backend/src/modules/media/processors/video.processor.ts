// src/modules/media/processors/video.processor.ts
import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { S3Service } from '../services/s3.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { promisify } from 'util';
import uploadConfig from 'src/config/upload.config';
import { VideoProcessingJob } from '../queues/media-queue.interface';

const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);

export interface VideoProcessingResult {
  thumbnail: {
    s3Key: string;
    width: number;
    height: number;
    size: number;
  };
  hls?: {
    playlistKey: string; // master.m3u8
    segmentKeys: string[]; // .ts files
    totalSize: number;
  };
}

@Injectable()
export class VideoProcessor implements OnModuleInit {
  private readonly logger = new Logger(VideoProcessor.name);

  /**
   * MVP: HLS transcoding is disabled.
   * EC2 t3.medium has insufficient RAM for concurrent ffmpeg forks,
   * and there is no HLS player on the frontend yet.
   * When this is re-enabled, set to true and implement frontend HLS player.
   */
  private readonly TRANSCODING_ENABLED = false;

  constructor(
    private readonly s3Service: S3Service,
    @Inject(uploadConfig.KEY)
    private readonly config: ConfigType<typeof uploadConfig>,
  ) { }

  async onModuleInit() {
    // Configure FFmpeg paths from ffprobe-static
    await this.configureFfmpeg();
  }

  private async configureFfmpeg() {
    try {
      this.logger.debug(
        '🔧 VideoProcessor: Configuring FFmpeg/FFprobe paths...',
      );

      if (ffmpegStatic) {
        ffmpeg.setFfmpegPath(ffmpegStatic);
        this.logger.log(
          `✅ VideoProcessor: FFmpeg configured: ${ffmpegStatic}`,
        );
      } else {
        this.logger.warn(
          '⚠️ VideoProcessor: FFmpeg path not found in ffmpeg-static',
        );
      }
      // Dynamic Import để tránh lỗi Lint/TS
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const ffprobeStatic = await import('ffprobe-static');

      // Xử lý interop giữa CommonJS và ESM
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const ffprobePath = ffprobeStatic.default?.path || ffprobeStatic.path;

      if (ffprobePath) {
        ffmpeg.setFfprobePath(ffprobePath);
        this.logger.log(
          `✅ VideoProcessor: FFprobe configured: ${ffprobePath}`,
        );
      } else {
        this.logger.warn(
          '⚠️ VideoProcessor: FFprobe path not found in ffprobe-static',
        );
      }
    } catch (error) {
      this.logger.warn(
        `⚠️ VideoProcessor: Could not load ffprobe-static: ${(error as Error).message}. Will use system FFprobe if available.`,
      );
    }
  }

  /**
   * Main processing function - generates thumbnail + HLS transcoding
   */
  async processVideo(job: VideoProcessingJob): Promise<VideoProcessingResult> {
    const { mediaId, s3Key, duration, width, height } = job;
    let tempDir: string | null = null;
    let localVideoPath: string | null = null;

    try {
      this.logger.log(`Starting video processing: ${mediaId}`, {
        duration,
        resolution: `${width}x${height}`,
      });

      // 1. Create temp directory
      tempDir = path.join(os.tmpdir(), `video-${randomUUID()}`);
      await mkdir(tempDir, { recursive: true });

      // 2. Download video from S3
      localVideoPath = await this.s3Service.downloadToLocalTemp(s3Key);

      // 3. Extract thumbnail at 1-second mark
      const thumbnail = await this.extractThumbnail(
        localVideoPath,
        s3Key,
        tempDir,
      );

      // 4. Transcode to HLS — disabled for MVP (TRANSCODING_ENABLED = false)
      let hls: VideoProcessingResult['hls'] = undefined;
      const shouldTranscode =
        this.TRANSCODING_ENABLED && ((duration ?? 0) > 30 || (width ?? 0) > 1280);

      if (shouldTranscode) {
        hls = await this.transcodeToHLS(
          localVideoPath,
          s3Key,
          tempDir,
          width ?? 0,
          height ?? 0,
        );
      }

      this.logger.log(`Video processing completed: ${mediaId}`, {
        thumbnail: thumbnail.s3Key,
        hlsPlaylist: hls?.playlistKey,
      });

      return { thumbnail, hls };
    } catch (error) {
      this.logger.error(`Video processing failed: ${mediaId}`, error);
      throw error;
    } finally {
      // Cleanup
      if (localVideoPath && fs.existsSync(localVideoPath)) {
        await fs.promises.unlink(localVideoPath).catch(() => { });
      }
      if (tempDir && fs.existsSync(tempDir)) {
        await fs.promises
          .rm(tempDir, { recursive: true, force: true })
          .catch(() => { });
      }
    }
  }

  /**
   * Extract thumbnail from video at specific timestamp
   */
  private async extractThumbnail(
    videoPath: string,
    originalS3Key: string,
    tempDir: string,
  ): Promise<VideoProcessingResult['thumbnail']> {
    const outputPath = path.join(tempDir, 'thumbnail.jpg');

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['1'], // 1 second
          filename: 'thumbnail.jpg',
          folder: tempDir,
          size: '480x?', // Width 480, maintain aspect ratio
        })
        .on('end', () => resolve())
        .on('error', (err) => reject(err));
    });

    // Read generated thumbnail
    const buffer = await fs.promises.readFile(outputPath);

    // Get dimensions using ffprobe
    const metadata = await this.getImageDimensions(outputPath);

    // Upload to S3
    const thumbnailKey = this.generateProcessedKey(
      originalS3Key,
      'thumbnail',
      'jpg',
    );

    await this.s3Service.uploadFile(thumbnailKey, buffer, 'image/jpeg');

    return {
      s3Key: thumbnailKey,
      width: metadata.width,
      height: metadata.height,
      size: buffer.length,
    };
  }

  /**
   * Transcode video to HLS format (master playlist + segments)
   */
  private async transcodeToHLS(
    videoPath: string,
    originalS3Key: string,
    tempDir: string,
    originalWidth: number,
    originalHeight: number,
  ): Promise<VideoProcessingResult['hls']> {
    const hlsDir = path.join(tempDir, 'hls');
    await mkdir(hlsDir, { recursive: true });

    const playlistPath = path.join(hlsDir, 'master.m3u8');

    // Quality presets (adaptive bitrate)
    const VIDEO_PRESETS = [
      { name: '480p', width: 854, height: 480, bitrate: '1000k' },
      { name: '720p', width: 1280, height: 720, bitrate: '2500k' },
    ];
    const HLS_SEGMENT_DURATION = 6;

    // Select appropriate quality preset (don't upscale)
    const quality =
      originalHeight >= 720
        ? VIDEO_PRESETS[1] // 720p
        : VIDEO_PRESETS[0]; // 480p

    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([
          '-c:v libx264', // H.264 codec
          '-c:a aac', // AAC audio
          `-b:v ${quality.bitrate}`, // Video bitrate
          '-b:a 128k', // Audio bitrate
          `-vf scale=${quality.width}:${quality.height}`, // Resize
          '-preset fast', // Encoding speed
          '-hls_time ' + HLS_SEGMENT_DURATION, // Segment duration
          '-hls_playlist_type vod', // Video on demand
          '-hls_segment_filename ' + path.join(hlsDir, 'segment%03d.ts'),
        ])
        .output(playlistPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .on('progress', (progress) => {
          this.logger.debug('Transcoding progress', {
            percent: progress.percent,
          });
        })
        .run();
    });

    // Read all generated files
    const files = await readdir(hlsDir);
    const segmentKeys: string[] = [];
    let totalSize = 0;

    // Upload all segments to S3
    const baseS3Path = this.generateProcessedKey(originalS3Key, 'hls', '');
    const s3Dir = baseS3Path.replace(/\/$/, ''); // Remove trailing slash

    for (const file of files) {
      const filePath = path.join(hlsDir, file);
      const buffer = await fs.promises.readFile(filePath);
      totalSize += buffer.length;

      const s3Key = `${s3Dir}/${file}`;
      const contentType = file.endsWith('.m3u8')
        ? 'application/vnd.apple.mpegurl'
        : 'video/mp2t';

      await this.s3Service.uploadFile(s3Key, buffer, contentType);

      if (file.endsWith('.ts')) {
        segmentKeys.push(s3Key);
      }
    }

    return {
      playlistKey: `${s3Dir}/master.m3u8`,
      segmentKeys,
      totalSize,
    };
  }

  /**
   * Get image dimensions using ffprobe
   */
  private async getImageDimensions(
    imagePath: string,
  ): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(imagePath, (err, metadata) => {
        if (err)
          return reject(err instanceof Error ? err : new Error(String(err)));
        const stream = metadata.streams[0];
        resolve({
          width: stream.width || 0,
          height: stream.height || 0,
        });
      });
    });
  }

  /**
   * Generate S3 key for processed versions
   */
  private generateProcessedKey(
    originalKey: string,
    variant: 'thumbnail' | 'hls',
    extension: string,
  ): string {
    const parsed = path.parse(originalKey);
    if (variant === 'hls') {
      return `${parsed.dir}/${parsed.name}-hls/`;
    }
    return `${parsed.dir}/${parsed.name}-${variant}.${extension}`;
  }

  /**
   * Validate FFmpeg installation
   */
  async healthCheck(): Promise<boolean> {
    return new Promise((resolve) => {
      ffmpeg.getAvailableFormats((err, formats) => {
        if (err) {
          this.logger.error('FFmpeg health check failed', err);
          resolve(false);
        } else {
          resolve(!!formats.mp4);
        }
      });
    });
  }
}
