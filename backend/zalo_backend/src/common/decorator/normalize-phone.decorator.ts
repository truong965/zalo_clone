import { Transform } from 'class-transformer';
import { PhoneNumberUtil } from '../utils/phone-number.util';
import { CountryCode } from 'libphonenumber-js';

/**
 * Decorator to automatically normalize phone numbers in DTOs.
 * 
 * @param defaultRegion Default country code if none provided (defaults to 'VN')
 */
export function NormalizePhone(defaultRegion: CountryCode = 'VN') {
  return Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return PhoneNumberUtil.normalize(value, defaultRegion);
  });
}
