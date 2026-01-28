// src/modules/media/services/file-validation.service.ts
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import NodeClam from 'clamscan';
import { fileTypeFromFile, fileTypeFromBuffer } from 'file-type';
import {
  MIME_TO_EXTENSION,
  SECURITY_PATTERNS,
  KNOWN_SIGNATURES,
  ERROR_MESSAGES,
} from 'src/common/constants/media.constant';
import uploadConfig from 'src/config/upload.config';
import sharp from 'sharp';
import Ffmpeg from 'fluent-ffmpeg';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import fs from 'fs';

export interface FileMetadata {
  width?: number;
  height?: number;
  duration?: number;
  format?: string;
  bitrate?: number;
}
export interface ValidationResult {
  isValid: boolean;
  mimeType?: string;
  extension?: string;
  size?: number;
  metadata?: FileMetadata;
  reason?: string;
  securityWarnings?: string[];
}

@Injectable()
export class FileValidationService implements OnModuleInit {
  private readonly logger = new Logger(FileValidationService.name);
  private clamscan: NodeClam;

  constructor(
    @Inject(uploadConfig.KEY)
    private readonly config: ConfigType<typeof uploadConfig>,
  ) {}

  async onModuleInit() {
    await this.initClamAV();
    await this.configureFfmpeg();
  }

  private async initClamAV() {
    if (!this.config.clamav.enabled) {
      this.logger.warn('ClamAV disabled - malware scanning skipped');
      return;
    }
    try {
      this.clamscan = await new NodeClam().init({
        clamdscan: {
          host: this.config.clamav.host,
          port: this.config.clamav.port,
          timeout: this.config.clamav.timeout,
        },
      });
      this.logger.log('ClamAV initialized successfully');
    } catch (e) {
      this.logger.warn('ClamAV not initialized', e);
    }
  }

  private async configureFfmpeg() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const ffprobeStatic = await import('ffprobe-static');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const ffprobePath = ffprobeStatic.default?.path || ffprobeStatic.path;

      if (ffprobePath) {
        Ffmpeg.setFfprobePath(ffprobePath);
        this.logger.log(`✅ FFprobe configured: ${ffprobePath}`);
      } else {
        this.logger.warn('⚠️ FFprobe path not found in ffprobe-static');
      }
    } catch (error) {
      this.logger.warn(
        `⚠️ Could not load ffprobe-static: ${(error as Error).message}. Will use system FFprobe if available.`,
      );
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }

  /**
   * MAIN ENTRY: Validate file integrity & Detect type
   */
  async validateBuffer(buffer: Buffer): Promise<ValidationResult> {
    if (buffer.length < 128) {
      return { isValid: false, reason: 'File too small to be valid media' };
    }

    const type = await fileTypeFromBuffer(buffer);
    if (!type) {
      return { isValid: false, reason: 'Unknown binary format' };
    }

    const { mime, ext } = type;
    const standardExt = MIME_TO_EXTENSION[mime] || ext;

    if (mime.startsWith('image/')) {
      return this.deepValidateImageBuffer(buffer, mime, standardExt);
    }

    if (mime.startsWith('video/')) {
      return this.withTempFile(buffer, standardExt, (path) =>
        this.deepValidateVideoFile(path, mime, standardExt),
      );
    }

    if (this.isDocumentType(mime)) {
      return this.deepValidateDocumentBuffer(buffer, mime, standardExt);
    }

    if (mime.startsWith('audio/')) {
      return this.deepValidateAudio(buffer, mime, standardExt);
    }

    return { isValid: false, reason: 'Unsupported file type' };
  }

  async validateFileOnDisk(filePath: string): Promise<ValidationResult> {
    try {
      const type = await fileTypeFromFile(filePath);
      if (!type) return { isValid: false, reason: 'Unknown file signature' };

      const { mime, ext } = type;
      const standardExt = MIME_TO_EXTENSION[mime] || ext;

      if (mime.startsWith('image/')) {
        const buffer = await fs.promises.readFile(filePath);
        return this.deepValidateImageBuffer(buffer, mime, standardExt);
      }

      if (mime.startsWith('video/')) {
        return this.deepValidateVideoFile(filePath, mime, standardExt);
      }

      if (mime.startsWith('audio/')) {
        return this.deepValidateAudioFile(filePath, mime, standardExt);
      }

      if (this.isDocumentType(mime)) {
        const buffer = await fs.promises.readFile(filePath);
        return this.deepValidateDocumentBuffer(buffer, mime, standardExt);
      }

      return { isValid: true, mimeType: mime, extension: standardExt };
    } catch (error) {
      this.logger.error('Disk validation failed', error);
      return {
        isValid: false,
        reason: `Disk validation error: ${this.getErrorMessage(error)}`,
      };
    }
  }

  // --- Helpers ---

  private async withTempFile(
    buffer: Buffer,
    ext: string,
    callback: (path: string) => Promise<ValidationResult>,
  ) {
    const tempFile = `/tmp/${randomUUID()}.${ext}`;
    try {
      await fs.promises.writeFile(tempFile, buffer);
      return await callback(tempFile);
    } finally {
      await fs.promises.unlink(tempFile).catch(() => {});
    }
  }

  private isDocumentType(mime: string): boolean {
    return (
      mime === 'application/pdf' ||
      mime.includes('document') ||
      mime.includes('msword')
    );
  }

  // --- 1. IMAGE DEEP VALIDATION ---
  private async deepValidateImageBuffer(
    buffer: Buffer,
    mime: string,
    ext: string,
  ): Promise<ValidationResult> {
    if (mime === 'image/svg+xml') {
      return this.validateSVG(buffer, mime, ext);
    }

    try {
      const metadata = await sharp(buffer).metadata();

      if (!metadata.width || !metadata.height) {
        return { isValid: false, reason: 'Image corrupted' };
      }

      if (
        metadata.width > this.config.limits.maxImageDimension ||
        metadata.height > this.config.limits.maxImageDimension
      ) {
        return {
          isValid: false,
          mimeType: mime,
          extension: ext,
          reason: 'Image dimensions too large (DoS risk)',
        };
      }

      return {
        isValid: true,
        mimeType: mime,
        extension: ext,
        metadata: {
          width: metadata.width,
          height: metadata.height,
          format: metadata.format,
        },
      };
    } catch (error) {
      return {
        isValid: false,
        mimeType: mime,
        extension: ext,
        reason: `Image decode failed: ${this.getErrorMessage(error)}`,
      };
    }
  }

  private validateSVG(buffer: Buffer, mime: string, ext: string) {
    const svgContent = buffer.toString('utf-8');
    for (const pattern of SECURITY_PATTERNS.SVG_DANGEROUS) {
      if (pattern.test(svgContent)) {
        return { isValid: false, reason: 'SVG contains dangerous scripts' };
      }
    }
    return { isValid: true, mimeType: mime, extension: ext };
  }

  // --- 2. VIDEO DEEP VALIDATION ---
  private async deepValidateVideoFile(
    filePath: string,
    mime: string,
    ext: string,
  ): Promise<ValidationResult> {
    return new Promise((resolve) => {
      Ffmpeg(filePath).ffprobe((err, data) => {
        if (err) {
          const errorMsg = (err as Error).message;
          if (errorMsg.includes(ERROR_MESSAGES.FFMPEG_NOT_FOUND)) {
            this.logger.warn(
              '⚠️ FFmpeg not available. Using magic number validation only.',
            );
            resolve({
              isValid: true,
              mimeType: mime,
              extension: ext,
              metadata: { duration: 0 },
            });
            return;
          }
          this.logger.warn('FFprobe validation error', {
            error: errorMsg,
            file: filePath,
          });
          resolve({
            isValid: false,
            mimeType: mime,
            extension: ext,
            reason: `Video validation failed: ${errorMsg}`,
          });
          return;
        }

        const videoStream = data.streams?.find((s) => s.codec_type === 'video');
        if (!videoStream) {
          resolve({
            isValid: false,
            mimeType: mime,
            extension: ext,
            reason: 'No video stream found',
          });
          return;
        }

        const duration = data.format?.duration || 0;
        if (duration > this.config.limits.maxVideoDurationSeconds) {
          resolve({
            isValid: false,
            reason: `Video too long (${duration}s, max ${this.config.limits.maxVideoDurationSeconds}s)`,
          });
          return;
        }

        resolve({
          isValid: true,
          mimeType: mime,
          extension: ext,
          metadata: {
            duration,
            width: videoStream.width,
            height: videoStream.height,
          },
        });
      });
    });
  }

  // --- 3. AUDIO DEEP VALIDATION ---
  private async deepValidateAudio(
    buffer: Buffer,
    mime: string,
    ext: string,
  ): Promise<ValidationResult> {
    return this.withTempFile(buffer, ext, async (tempFile) => {
      const malwareCheck = await this.scanMalware(buffer);
      if (!malwareCheck.isValid && this.config.clamav.enabled) {
        return malwareCheck as ValidationResult;
      }
      return this.deepValidateAudioFile(tempFile, mime, ext);
    });
  }

  private async deepValidateAudioFile(
    filePath: string,
    mime: string,
    ext: string,
  ): Promise<ValidationResult> {
    return new Promise((resolve) => {
      Ffmpeg(filePath).ffprobe((err, data) => {
        if (err) {
          const errorMsg = (err as Error).message;
          if (errorMsg.includes(ERROR_MESSAGES.FFMPEG_NOT_FOUND)) {
            this.logger.warn(
              '⚠️ FFmpeg not available. Using magic number validation only.',
            );
            resolve({
              isValid: true,
              mimeType: mime,
              extension: ext,
              metadata: { duration: 0 },
            });
            return;
          }
          // Lenient for audio
          this.logger.warn(`Audio FFprobe error: ${errorMsg}`);
          resolve({
            isValid: false,
            reason: `Audio validation failed: ${errorMsg}`,
          });
          return;
        }

        const audioStream = data.streams?.find((s) => s.codec_type === 'audio');
        if (!audioStream) {
          resolve({ isValid: false, reason: 'No audio stream found' });
          return;
        }

        const duration = data.format?.duration || 0;
        if (duration > this.config.limits.maxAudioDurationSeconds) {
          resolve({
            isValid: false,
            reason: `Audio too long (${duration}s, max ${this.config.limits.maxAudioDurationSeconds}s)`,
          });
          return;
        }

        resolve({
          isValid: true,
          mimeType: mime,
          extension: ext,
          metadata: { duration },
        });
      });
    });
  }

  // --- 4. DOCUMENT DEEP VALIDATION ---
  private async deepValidateDocumentBuffer(
    buffer: Buffer,
    mime: string,
    ext: string,
  ): Promise<ValidationResult> {
    const malwareCheck = await this.scanMalware(buffer);
    if (!malwareCheck.isValid) return malwareCheck;

    // Check for scripts inside document (Extra security)
    if (this.hasEmbeddedScripts(buffer)) {
      this.logger.warn('Embedded scripts detected in document');
      return {
        isValid: true,
        mimeType: mime,
        extension: ext,
        securityWarnings: ['Document contains embedded scripts'],
      };
    }

    return { isValid: true, mimeType: mime, extension: ext };
  }

  // --- HELPER: MALWARE SCAN ---
  private async scanMalware(
    buffer: Buffer,
  ): Promise<{ isValid: boolean; reason?: string }> {
    if (!this.clamscan) {
      return { isValid: true };
    }
    try {
      const stream = Readable.from(buffer);
      const { isInfected, viruses } = await this.clamscan.scanStream(stream);

      if (isInfected) {
        return {
          isValid: false,
          reason: `Malware detected: ${viruses.join(',')}`,
        };
      }
      return { isValid: true };
    } catch (e) {
      this.logger.error('ClamAV scan error', e);
      return { isValid: true }; // Fail open
    }
  }

  // --- HELPER: VALIDATE MIME TYPE (FULLY IMPLEMENTED) ---
  /**
   * Validate file via magic numbers (binary signature)
   * Also checks for Executables and Polyglots
   */
  async validateMimeType(
    buffer: Buffer,
    declaredMimeType: string,
  ): Promise<ValidationResult> {
    const securityWarnings: string[] = [];
    try {
      // 1. Detect actual MIME type
      const detectedType = await fileTypeFromBuffer(buffer);

      if (!detectedType) {
        this.logger.warn('Unable to detect file type', {
          declaredMimeType,
          bufferSize: buffer.length,
        });
        return {
          isValid: false,
          reason: 'Unable to detect file type from binary data',
        };
      }

      // 2. Mime Mismatch Check
      if (detectedType.mime !== declaredMimeType) {
        this.logger.warn('MIME type mismatch detected', {
          declared: declaredMimeType,
          detected: detectedType.mime,
        });
        return {
          isValid: false,
          reason: `File type mismatch. Expected ${declaredMimeType}, got ${detectedType.mime}`,
          mimeType: detectedType.mime,
        };
      }

      // 3. Executable Check
      if (this.isExecutable(buffer)) {
        this.logger.error('Executable file detected', { declaredMimeType });
        return {
          isValid: false,
          reason: 'Executable file detected - potential security threat',
        };
      }

      // 4. Polyglot Check
      if (this.hasMultipleSignatures(buffer)) {
        securityWarnings.push(
          'File contains multiple format signatures - possible polyglot',
        );
        this.logger.warn('Polyglot file suspected', {
          mimeType: detectedType.mime,
        });
      }

      // 5. Embedded Script Check
      if (
        declaredMimeType.startsWith('application/') &&
        this.hasEmbeddedScripts(buffer)
      ) {
        securityWarnings.push('Document may contain embedded scripts');
        this.logger.warn('Embedded scripts detected', {
          mimeType: detectedType.mime,
        });
      }

      this.logger.debug('File validation passed', {
        mimeType: detectedType.mime,
      });

      return {
        isValid: true,
        mimeType: detectedType.mime,
        securityWarnings:
          securityWarnings.length > 0 ? securityWarnings : undefined,
      };
    } catch (error: any) {
      this.logger.error('File validation error', {
        error: (error as Error).message,
      });
      return { isValid: false, reason: 'Validation error occurred' };
    }
  }

  private isExecutable(buffer: Buffer): boolean {
    const signatures = [
      Buffer.from([0x4d, 0x5a]), // Windows EXE (MZ)
      Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // Linux ELF
      Buffer.from([0x23, 0x21]), // Shebang (#!)
      Buffer.from([0xca, 0xfe, 0xba, 0xbe]), // macOS Mach-O (32-bit)
      Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), // macOS Mach-O (64-bit)
      Buffer.from([0x50, 0x4b, 0x03, 0x04]), // ZIP (could be JAR/APK)
    ];
    return signatures.some((sig) => buffer.slice(0, sig.length).equals(sig));
  }

  private hasMultipleSignatures(buffer: Buffer): boolean {
    let matchCount = 0;
    // Use Centralized Signatures
    for (const sig of KNOWN_SIGNATURES) {
      if (buffer.includes(Buffer.from(sig.bytes))) matchCount++;
    }
    return matchCount > 1;
  }

  private hasEmbeddedScripts(buffer: Buffer): boolean {
    const bufferStr = buffer.toString(
      'utf-8',
      0,
      Math.min(buffer.length, 8192),
    );
    // Use Centralized Script Patterns
    return SECURITY_PATTERNS.SCRIPTS.some((pattern) =>
      bufferStr.toLowerCase().includes(pattern.toLowerCase()),
    );
  }

  validateFileSize(fileSize: number, maxSizeMB: number): ValidationResult {
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (fileSize > maxBytes)
      return { isValid: false, reason: `Exceeds ${maxSizeMB}MB` };
    if (fileSize <= 0)
      return { isValid: false, reason: 'File size must be greater than 0' };
    return { isValid: true };
  }
}
