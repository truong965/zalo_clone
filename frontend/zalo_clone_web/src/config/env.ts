/**
 * Validate and export environment variables
 */

const requiredEnvVars = ['VITE_BACKEND_URL', 'VITE_SOCKET_URL'] as const;

function validateEnv() {
      const missing = requiredEnvVars.filter((key) => !import.meta.env[key]);

      if (missing.length > 0) {
            const message = `Missing required environment variables: ${missing.join(', ')}`;
            if (import.meta.env.PROD) {
                  throw new Error(message);
            } else {
                  console.warn(`[env] ${message}`);
            }
      }

      return {
            BACKEND_URL: import.meta.env.VITE_BACKEND_URL as string,
            SOCKET_URL: import.meta.env.VITE_SOCKET_URL as string,

            // Firebase Web App (optional — push notifications)
            FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
            FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
            FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
            FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
            FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
            FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
            FIREBASE_MEASUREMENT_ID: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,

            // VAPID key for Web Push
            VAPID_PUBLIC_KEY: import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined,
      };
}

export const env = validateEnv();
