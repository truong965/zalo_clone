import { Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';
import * as qrcode from 'qrcode';
import type { ITotpProvider, TotpSetupData } from '../interfaces/totp-provider.interface';

@Injectable()
export class GoogleAuthenticatorProvider implements ITotpProvider {
  constructor() {}

  async generateSecret(accountName: string, issuer: string): Promise<TotpSetupData> {
    const secret = generateSecret({ length: 20 }); // 20 bytes = 160 bits
    const otpAuthUri = generateURI({ 
        issuer, 
        label: accountName, 
        secret 
    });
    const qrCodeDataUrl = await qrcode.toDataURL(otpAuthUri);
    return { secret, otpAuthUri, qrCodeDataUrl };
  }

  async verify(secret: string, token: string): Promise<boolean> {
    const result = await verify({ 
        secret, 
        token,
        epochTolerance: 30, // Equivalent to window=1 (30 seconds)
    });
    return result.valid;
  }

  generateOtpAuthUri(secret: string, accountName: string, issuer: string): string {
    return generateURI({ 
        issuer, 
        label: accountName, 
        secret 
    });
  }
}
