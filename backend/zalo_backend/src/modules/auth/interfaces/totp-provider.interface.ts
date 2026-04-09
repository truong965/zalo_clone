export interface TotpSetupData {
  secret: string;     // Base32 secret — cần encrypt trước khi lưu DB
  otpAuthUri: string; // otpauth://totp/Issuer:Account?secret=...&issuer=...
  qrCodeDataUrl: string; // base64 PNG QR code cho FE hiển thị
}

export interface ITotpProvider {
  // Generate secret cho user (lần đầu setup)
  generateSecret(accountName: string, issuer: string): Promise<TotpSetupData>;
  
  // Verify OTP code nhập từ user
  verify(secret: string, token: string): Promise<boolean> | boolean;
  
  // Generate QR code URI (otpauth://)
  generateOtpAuthUri?(secret: string, accountName: string, issuer: string): string;
}
