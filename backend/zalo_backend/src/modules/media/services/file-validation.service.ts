// src/modules/media/services/file-validation.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  detectedMimeType?: string;
  securityWarnings?: string[];
}

@Injectable()
export class FileValidationService {
  private readonly logger = new Logger(FileValidationService.name);
  private readonly VALIDATION_BUFFER_SIZE = 4096; // 4KB
  /**
   * Validate file via magic numbers (binary signature)
   */
  async validateMimeType(
    buffer: Buffer,
    declaredMimeType: string,
  ): Promise<ValidationResult> {
    const securityWarnings: string[] = [];
    try {
      // Detect actual MIME type from binary content
      const detectedType = await fileTypeFromBuffer(buffer);

      if (!detectedType) {
        this.logger.warn('Unable to detect file type', {
          declaredMimeType,
          bufferSize: buffer.length,
        });
        return {
          valid: false,
          reason: 'Unable to detect file type from binary data',
        };
      }

      // Check if detected type matches declared type
      if (detectedType.mime !== declaredMimeType) {
        this.logger.warn('MIME type mismatch detected', {
          declared: declaredMimeType,
          detected: detectedType.mime,
        });

        return {
          valid: false,
          reason: `File type mismatch. Expected ${declaredMimeType}, got ${detectedType.mime}`,
          detectedMimeType: detectedType.mime,
        };
      }

      // Check for executables disguised as media
      if (this.isExecutable(buffer)) {
        this.logger.error('Executable file detected', {
          declaredMimeType,
          detectedMimeType: detectedType.mime,
        });

        return {
          valid: false,
          reason: 'Executable file detected - potential security threat',
        };
      }
      // ✅ 4. Polyglot file detection (basic)
      if (this.hasMultipleSignatures(buffer)) {
        securityWarnings.push(
          'File contains multiple format signatures - possible polyglot',
        );
        this.logger.warn('Polyglot file suspected', {
          mimeType: detectedType.mime,
        });
      }
      // ✅ 5. Embedded script detection (for documents)
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
        valid: true,
        detectedMimeType: detectedType.mime,
        securityWarnings:
          securityWarnings.length > 0 ? securityWarnings : undefined,
      };
    } catch (error: any) {
      this.logger.error('File validation error', {
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      return {
        valid: false,
        reason: 'Validation error occurred',
      };
    }
  }

  /**
   * Check for executable signatures
   */
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

  /**
   * ✅ NEW: Detect polyglot files (multiple format signatures)
   */
  private hasMultipleSignatures(buffer: Buffer): boolean {
    const knownSignatures = [
      { name: 'JPEG', bytes: [0xff, 0xd8, 0xff] },
      { name: 'PNG', bytes: [0x89, 0x50, 0x4e, 0x47] },
      { name: 'GIF', bytes: [0x47, 0x49, 0x46, 0x38] },
      { name: 'PDF', bytes: [0x25, 0x50, 0x44, 0x46] },
      { name: 'ZIP', bytes: [0x50, 0x4b, 0x03, 0x04] },
    ];

    let matchCount = 0;

    for (const sig of knownSignatures) {
      const sigBuffer = Buffer.from(sig.bytes);
      // Search entire buffer (not just start)
      if (buffer.includes(sigBuffer)) {
        matchCount++;
      }
    }

    return matchCount > 1; // Suspicious if multiple signatures found
  }

  /**
   * ✅ NEW: Detect embedded scripts in documents
   */
  private hasEmbeddedScripts(buffer: Buffer): boolean {
    const scriptPatterns = [
      '<script',
      'javascript:',
      'vbscript:',
      'data:text/html',
      'onerror=',
      'onload=',
    ];

    const bufferStr = buffer.toString(
      'utf-8',
      0,
      Math.min(buffer.length, 8192),
    );

    return scriptPatterns.some((pattern) =>
      bufferStr.toLowerCase().includes(pattern.toLowerCase()),
    );
  }

  /**
   * Validate file size against limit
   */
  validateFileSize(fileSize: number, maxSizeMB: number): ValidationResult {
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (fileSize > maxSizeBytes) {
      return {
        valid: false,
        reason: `File size (${this.formatBytes(fileSize)}) exceeds ${maxSizeMB}MB limit`,
      };
    }

    if (fileSize <= 0) {
      return {
        valid: false,
        reason: 'File size must be greater than 0',
      };
    }

    return { valid: true };
  }

  /**
   * Format bytes to human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
