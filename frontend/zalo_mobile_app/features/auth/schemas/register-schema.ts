import { z } from 'zod';

import { PHONE_REGEX } from '@/constants/validation';

export const registerSchema = z
      .object({
            displayName: z.string().trim().min(1, 'auth.validation.displayNameRequired'),
            phoneNumber: z
                  .string()
                  .trim()
                  .min(1, 'auth.validation.phoneRequired')
                  .regex(PHONE_REGEX, 'auth.validation.invalidPhoneNumber'),
            password: z.string().min(6, 'auth.validation.passwordMin'),
            confirmPassword: z.string().min(1, 'auth.validation.confirmPasswordRequired'),
            gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
            dateOfBirth: z
                  .date()
                  .max(new Date(), 'auth.validation.dobInFuture')
                  .optional()
                  .or(z.string().optional()),
      })
      .refine((value) => value.password === value.confirmPassword, {
            message: 'auth.validation.passwordMismatch',
            path: ['confirmPassword'],
      });

export type RegisterFormData = z.infer<typeof registerSchema>;
