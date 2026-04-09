import { registerAs } from '@nestjs/config';

export default registerAs('security', () => ({
  // Two-Factor Authentication & OTP
  otpTtl: parseInt(process.env.AUTH_OTP_TTL || '90', 10), // 90 seconds (Hardened from 180s)
  cooldownTtl: parseInt(process.env.AUTH_COOLDOWN_TTL || '45', 10), // 45 seconds between requests
  session2faTtl: parseInt(process.env.AUTH_2FA_SESSION_TTL || '600', 10), // 10 minutes for pending 2FA login
  setup2faTtl: parseInt(process.env.AUTH_2FA_SETUP_TTL || '600', 10), // 10 minutes for setup flow

  // Registration
  registerVerifiedTtl: parseInt(process.env.AUTH_REGISTER_VERIFIED_TTL || '600', 10), // 10 minutes after OTP verify

  // Login Protection
  lockoutTtl: parseInt(process.env.AUTH_LOCKOUT_TTL || '1800', 10), // 30 minutes (Increased from 15m)
  maxLoginAttempts: parseInt(process.env.AUTH_MAX_LOGIN_ATTEMPTS || '5', 10),
}));
