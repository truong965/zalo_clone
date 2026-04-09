import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ISmsProvider } from '../interfaces/sms-provider.interface';

/**
 * SpeedSmsProvider
 * Official implementation for real SMS delivery in production.
 */
export class SpeedSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(SpeedSmsProvider.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.speedsms.vn/index.php';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SPEEDSMS_API_KEY') || '';
  }

  /**
   * Normalize phone number for SpeedSMS (standardizes to 84xxxx format)
   * Converts +849... or 09... to 849...
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    let normalized = phoneNumber.trim().replace(/\s+/g, '');
    
    // Remove '+' if exists
    if (normalized.startsWith('+')) {
      normalized = normalized.substring(1);
    }
    
    // If starts with '0', replace with '84'
    if (normalized.startsWith('0')) {
      normalized = '84' + normalized.substring(1);
    }
    
    // Ensure it starts with 84 for Vietnamese numbers
    if (!normalized.startsWith('84') && normalized.length >= 9) {
      normalized = '84' + normalized;
    }
    
    return normalized;
  }

  async sendOtp(phoneNumber: string, otp: string): Promise<void> {
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    // Remove diacritics for SMS compatibility if needed, but SpeedSMS handles UTF-8 usually.
    // Keeping it simple as per documentation.
    const content = `Ma OTP cua ban la: ${otp}. Co hieu luc trong 90 giay.`;

    this.logger.log(`[SpeedSMS] Attempting to send OTP to ${normalizedPhone}`);

    if (!this.apiKey) {
      this.logger.error('SPEEDSMS_API_KEY is missing in configuration.');
      throw new HttpException(
        'Dịch vụ SMS chưa được cấu hình. Vui lòng thử lại sau.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      /**
       * SpeedSMS params:
       * - type 2: random long number
       * - type 4: SpeedSMS default Brandname (Verify/Notify)
       */
const rawType = this.configService.get<string>('SPEEDSMS_TYPE');
const smsType = rawType ? parseInt(rawType, 10) : 2;
const sender = (this.configService.get<string>('SPEEDSMS_SENDER') || '').trim();

const body: Record<string, unknown> = {
  to: [normalizedPhone],
  content: content,
  sms_type: smsType,
};

// Basic Auth: base64(API_KEY + ':x')
const auth = 'Basic ' + Buffer.from(this.apiKey + ':x').toString('base64');

this.logger.debug(`[SpeedSMS] POST Request: to=${normalizedPhone}, sms_type=${smsType}, sender="${sender}"`);

const response = await axios.post(
  `${this.baseUrl}/sms/send`,  // ← bỏ ?access-token
  body,
  {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': auth,   // ← Basic Auth
    },
  }
);

      // Log full response for debugging if status is not success
      if (response.data.status !== 'success') {
        this.logger.error(`[SpeedSMS] Raw API Response: ${JSON.stringify(response.data)}`);
      }

      const { status, code, message } = response.data;

      if (status === 'success') {
        const tranId = response.data.data?.tranId;
        this.logger.debug(`[SpeedSMS] OTP sent successfully. TranId: ${tranId}`);
      } else {
        this.logger.error(`[SpeedSMS] API Error: ${message} (Code: ${code})`);
        
        let finalMessage = `Không thể gửi tin nhắn SMS: ${message || 'Lỗi từ nhà cung cấp'}`;
        
        if (message === 'sender not found') {
          finalMessage = 'Lỗi SpeedSMS: "sender not found". Hãy kiểm tra Dashboard SpeedSMS -> Settings -> Brandname để xem danh sách Sender ID được phép, hoặc thử dùng VOICE OTP nếu SMS gặp khó khăn.';
        }

        throw new HttpException(finalMessage, HttpStatus.BAD_GATEWAY);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      
      const errorMessage = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      this.logger.error(`[SpeedSMS] Request failed: ${errorMessage}`);
      throw new HttpException(
        'Gửi mã OTP qua SMS thất bại. Vui lòng thử lại sau hoặc sử dụng Telegram.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
