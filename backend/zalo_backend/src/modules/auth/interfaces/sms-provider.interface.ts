export interface ISmsProvider {
  /**
   * Gửi mã OTP đến số điện thoại
   */
  sendOtp(phoneNumber: string, otp: string): Promise<void>;
}
