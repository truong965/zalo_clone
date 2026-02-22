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
      };
}

export const env = validateEnv();
