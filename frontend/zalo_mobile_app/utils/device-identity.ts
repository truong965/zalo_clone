import * as SecureStore from 'expo-secure-store';

const DEVICE_ID_KEY = 'zalo_mobile_device_id';

function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

let cachedDeviceId: string | null = null;

/**
 * Gets a stable device ID for the mobile app using SecureStore.
 * If one does not exist, it generates a new UUID and persists it.
 */
export async function getStableDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  try {
    let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    
    if (!deviceId) {
      deviceId = generateUuid();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
    }
    
    cachedDeviceId = deviceId;
    return deviceId;
  } catch (error) {
    console.error('Error accessing SecureStore for deviceId', error);
    // Fallback if secure store fails
    const fallbackId = `fallback-${generateUuid()}`;
    cachedDeviceId = fallbackId;
    return fallbackId;
  }
}

/**
 * Clears the persisted device ID.
 * This should ONLY be called on explicit UNTRUST operations,
 * but generally, a device retains its ID even across logouts.
 */
export async function resetDeviceId(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(DEVICE_ID_KEY);
    cachedDeviceId = null;
  } catch (error) {
    console.error('Error deleting deviceId from SecureStore', error);
  }
}
