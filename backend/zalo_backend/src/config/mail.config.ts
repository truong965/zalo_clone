import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT || '587', 10),
  user: process.env.EMAIL_AUTH_USER || '',
  password: process.env.EMAIL_AUTH_PASSWORD || '',
  from: process.env.MAIL_FROM || '"Zalo Clone" <truongmaiduc18@gmail.com>',
  preview: process.env.EMAIL_PREVIEW === 'true',
}));
