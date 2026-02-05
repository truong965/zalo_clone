/**
 * Validate and export environment variables
 */

const requiredEnvVars = ['VITE_API_URL'] as const;

function validateEnv() {
  const missing = requiredEnvVars.filter((key) => !import.meta.env[key]);

  if (missing.length > 0) {
    console.warn(`Missing environment variables: ${missing.join(', ')}`);
  }

  return {
    API_URL: import.meta.env.VITE_API_URL as string,
    SOCKET_URL: (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL) as string,
  };
}

export const env = validateEnv();
