import { parsePhoneNumber, CountryCode } from 'libphonenumber-js';
import * as crypto from 'crypto';

export class PhoneNumberUtil {
  /**
   * Normalizes a phone number to E.164 format.
   * If parsing fails, it returns the input string with all non-digit characters removed and a '+' prefix.
   * 
   * @param phoneNumber Raw phone number string
   * @param defaultRegion Default country code (e.g., 'VN')
   */
  static normalize(phoneNumber: string, defaultRegion: CountryCode = 'VN'): string {
    if (!phoneNumber) return '';

    // If it looks like an email, don't normalize it as a phone number
    if (phoneNumber.includes('@')) {
      return phoneNumber.trim();
    }

    try {
      const parsed = parsePhoneNumber(phoneNumber, defaultRegion);
      if (parsed && parsed.isValid()) {
        return parsed.format('E.164');
      }
    } catch (error) {
      // Fallback for extremely malformed numbers that libphonenumber-js can't handle
    }

    // Manual fallback for Vietnam specific common formats if parser fails
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // If it starts with 0 and we are in VN context, replace 0 with +84
    if (cleaned.startsWith('0') && cleaned.length >= 10) {
      return '+84' + cleaned.substring(1);
    }

    // Ensure it starts with +
    if (!cleaned.startsWith('+') && cleaned.length > 0) {
      return '+' + cleaned;
    }

    return cleaned;
  }

  /**
   * Hashes a normalized phone number using SHA-256.
   * 
   * @param normalizedPhone E.164 formatted phone number
   */
  static hash(normalizedPhone: string): string {
    if (!normalizedPhone) return '';
    return crypto.createHash('sha256').update(normalizedPhone).digest('hex');
  }
}
