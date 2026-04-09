import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { ec as EC } from 'elliptic';

const ec = new EC('p256');
const PRIVATE_KEY_STORAGE_KEY = 'zalo_mobile_device_private_key';

/**
 * Gets the device's ECDSA public key.
 * If no key pair exists, it generates a new one and stores the private key securely.
 */
export async function getDevicePublicKey(): Promise<string | null> {
  try {
    let privateKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);

    if (!privateKeyHex) {
      // Generate 32 random bytes for the private key using expo-crypto
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      const newPrivateKeyHex = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      
      // Store private key securely
      await SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_KEY, newPrivateKeyHex);
      privateKeyHex = newPrivateKeyHex;
      
      console.log('[Crypto] Generated new ECDSA (P-256) device key pair');
    }

    // Recover public key from stored private key (Uncompressed: 65 bytes)
    const keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
    return keyPair.getPublic(false, 'hex');
  } catch (error) {
    console.error('[Crypto] Error managing device key pair', error);
    return null;
  }
}

/**
 * Signs a message/payload with the device's private key.
 * Used for challenge-response attestation.
 */
export async function signWithDeviceKey(message: string): Promise<string | null> {
  try {
    const privateKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
    if (!privateKeyHex) return null;

    // IMPORTANT: Hash the message with SHA-256 first.
    // Node.js crypto.verify('SHA256', data, ...) hashes data internally,
    // but elliptic's sign() expects the hash as input (does NOT hash again).
    // Without this step, the signatures will never match.
    const messageHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      message
    );

    const keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
    const signature = keyPair.sign(messageHash);
    
    // Return signature as hex string (DER format)
    return signature.toDER('hex');
  } catch (error) {
    console.error('[Crypto] Error signing message', error);
    return null;
  }
}

/**
 * Returns the key algorithm used.
 */
export function getDeviceKeyAlgorithm(): string {
  return 'p256';
}
