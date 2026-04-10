import * as crypto from 'crypto';

export class EncryptionUtil {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 16;
  
  // Use a fallback key for development if env var is missing, but log a warning
  private static getKey(): Buffer {
    let keyString = process.env.TWO_FACTOR_ENCRYPTION_KEY;
    if (!keyString) {
      console.warn('WARNING: TWO_FACTOR_ENCRYPTION_KEY not set in environment. Using fallback key for development only!');
      keyString = crypto.createHash('sha256').update('dev-fallback-key').digest('hex');
    }
    // Key should be exactly 32 bytes hex encoded string (64 characters long)
    if (keyString.length !== 64) {
        keyString = crypto.createHash('sha256').update(keyString).digest('hex');
    }
    return Buffer.from(keyString, 'hex');
  }

  static encrypt(plaintext: string): string {
    const key = this.getKey();
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // Format: "base64(iv):base64(encrypted):base64(authTag)"
    return `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`;
  }

  static decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }

    const [ivStr, encryptedStr, authTagStr] = parts;
    const key = this.getKey();
    const iv = Buffer.from(ivStr, 'base64');
    const authTag = Buffer.from(authTagStr, 'base64');
    
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedStr, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
