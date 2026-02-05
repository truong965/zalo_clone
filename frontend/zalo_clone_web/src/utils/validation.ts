/**
 * Utility functions - Validation
 */

import { z } from 'zod';

/**
 * Email validation
 */
export const emailSchema = z.string().email('Email không hợp lệ');

/**
 * Password validation - ít nhất 8 ký tự, có chữ hoa, chữ thường, số
 */
export const passwordSchema = z
      .string()
      .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
      .regex(/[A-Z]/, 'Mật khẩu phải chứa ít nhất 1 chữ hoa')
      .regex(/[a-z]/, 'Mật khẩu phải chứa ít nhất 1 chữ thường')
      .regex(/[0-9]/, 'Mật khẩu phải chứa ít nhất 1 số');

/**
 * Phone number validation (Việt Nam)
 */
export const phoneSchema = z
      .string()
      .regex(/^(0[3-9])[0-9]{8}$/, 'Số điện thoại không hợp lệ');

/**
 * Validate URL
 */
export function isValidUrl(url: string): boolean {
      try {
            new URL(url);
            return true;
      } catch {
            return false;
      }
}

/**
 * Validate file size
 */
export function isValidFileSize(sizeInBytes: number, maxSizeInMB: number): boolean {
      return sizeInBytes <= maxSizeInMB * 1024 * 1024;
}

/**
 * Validate MIME type
 */
export function isValidMimeType(
      mimeType: string,
      allowedTypes: string[],
): boolean {
      return allowedTypes.includes(mimeType);
}
