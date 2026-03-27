import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;
  private readonly config: any;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get('mail');
    
    if (!this.config) {
      this.logger.error('Mail configuration not found!');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.port === 465,
      auth: {
        user: this.config.user,
        pass: this.config.password,
      },
    });
  }

  async sendMail(to: string, subject: string, html: string) {
    if (!this.transporter) {
      this.logger.error('Mail transporter not initialized');
      return null;
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.config.from,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn('Email sending failed in development, continuing...');
        return null;
      }
      throw error;
    }
  }

  async sendOtpEmail(email: string, otp: string) {
    const subject = 'Zalo Clone - Mật khẩu một lần (OTP)';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #0068ff; text-align: center;">Zalo Clone</h2>
        <p>Chào bạn,</p>
        <p>Đây là mã OTP để đặt lại mật khẩu của bạn. Mã này có hiệu lực trong <b>5 phút</b>.</p>
        <div style="background-color: #f0f7ff; padding: 20px; text-align: center; border-radius: 5px; font-size: 24px; font-weight: bold; color: #0068ff; letter-spacing: 5px;">
          ${otp}
        </div>
        <p style="margin-top: 20px;">Nếu bạn không yêu cầu thay đổi mật khẩu, vui lòng bỏ qua email này.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888; text-align: center;">Đây là email tự động, vui lòng không trả lời.</p>
      </div>
    `;
    return this.sendMail(email, subject, html);
  }
}
