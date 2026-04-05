/**
 * Validate and export environment variables
 */

const requiredEnvVars = ['VITE_BACKEND_URL', 'VITE_SOCKET_URL'] as const;

function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
      if (value == null || value === '') return defaultValue;
      return value.toLowerCase() === 'true';
}

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

            // Phase 0: Unified AI stream contract rollout flag
            AI_UNIFIED_STREAM_ENABLED: parseBooleanEnv(import.meta.env.VITE_AI_UNIFIED_STREAM_ENABLED, false),
      };
}

export const env = validateEnv();
