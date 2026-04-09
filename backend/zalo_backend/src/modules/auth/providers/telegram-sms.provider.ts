import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ISmsProvider } from '../interfaces/sms-provider.interface';

export class TelegramSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(TelegramSmsProvider.name);
  private readonly botToken: string;
  private readonly chatId: string;

  constructor(private readonly configService: ConfigService) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || '';
    this.chatId = this.configService.get<string>('TELEGRAM_OTP_CHAT_ID') || '';
    
    if (!this.botToken || !this.chatId) {
      this.logger.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_OTP_CHAT_ID is missing. SMS simulation will not work properly.');
    }
  }

  async sendOtp(phoneNumber: string, otp: string): Promise<void> {
    this.logger.log(`[SMS Simulation] Sending OTP ${otp} to ${phoneNumber} via Telegram`);

    if (!this.botToken || !this.chatId) {
      this.logger.error('Telegram configuration missing. OTP cannot be sent.');
      throw new HttpException(
        'Dịch vụ SMS giả lập (Telegram) chưa được cấu hình.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const message = `📱 [ZALO CLONE - OTP]\nPhone: ${phoneNumber}\nOTP: ${otp}\nValid for: 90 seconds`;

    try {
      await axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'HTML',
      });
      this.logger.debug(`[SMS Simulation] OTP sent to Telegram successfully`);
    } catch (error) {
      this.logger.error(`[SMS Simulation] Failed to send OTP to Telegram: ${(error as any).message}`);
      throw new HttpException(
        'Gửi mã OTP qua Telegram thất bại. Vui lòng thử lại sau.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
