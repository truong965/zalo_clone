import { z } from 'zod';

const phoneRegex = /^(0|84)(3|5|7|8|9)([0-9]{8})$/;

export const registerSchema = z
      .object({
            displayName: z.string().trim().min(1, 'auth.validation.displayNameRequired'),
            phoneNumber: z
                  .string()
                  .trim()
                  .min(1, 'auth.validation.phoneRequired')
                  .regex(phoneRegex, 'auth.validation.invalidPhoneNumber'),
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
