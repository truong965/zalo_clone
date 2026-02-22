/**
 * ApiError — Normalized HTTP API error.
 *
 * All Axios errors are converted to ApiError instances by the axios response
 * interceptor so every catch block in the app receives a consistent shape.
 *
 * Key properties:
 *   - `message`  — Human-readable server error message (via Error.message)
 *   - `status`   — HTTP status code (0 for network / timeout errors)
 *   - `code`     — Backend error code string from ErrorResponse.error field
 */

import type { AxiosError } from 'axios';
import type { ErrorResponse } from '@/types/api';

export class ApiError extends Error {
      /** HTTP status code (0 for network/timeout errors) */
      status: number;
      /** Backend error code string (e.g. 'USER_NOT_FOUND') */
      code: string;

      constructor(opts: { status: number; message: string; code?: string }) {
            super(opts.message);
            this.name = 'ApiError';
            this.status = opts.status;
            this.code = opts.code ?? '';
            // Fix prototype chain for `instanceof` to work after transpilation
            Object.setPrototypeOf(this, ApiError.prototype);
      }

      /**
       * Convert any thrown value to an ApiError.
       *
       * - If already an ApiError, returns as-is.
       * - If an AxiosError, extracts status + server message.
       * - Otherwise, uses the error message (or empty string for unknown errors).
       *
       * Returning empty string for `.message` when the server provides no message
       * preserves consumer-side `|| 'fallback text'` patterns.
       */
      static from(error: unknown): ApiError {
            if (error instanceof ApiError) return error;

            const axiosErr = error as AxiosError<ErrorResponse>;
            if (axiosErr.isAxiosError) {
                  const status = axiosErr.response?.status ?? 0;
                  // Deliberately empty-string (not fallback) so consumer's `|| 'fallback'` triggers
                  const message = axiosErr.response?.data?.message ?? '';
                  const code = axiosErr.response?.data?.error ?? '';
                  return new ApiError({ status, message, code });
            }

            // Generic JS error (e.g. thrown string, non-Axios promise rejection)
            const err = error as Error;
            return new ApiError({ status: 0, message: err?.message ?? '' });
      }
}
