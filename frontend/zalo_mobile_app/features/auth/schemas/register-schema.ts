import { z } from 'zod';

export const registerSchema = z
      .object({
            displayName: z.string().min(1, 'auth.validation.displayNameRequired'),
            phoneNumber: z.string().min(1, 'auth.validation.phoneRequired'),
            password: z.string().min(1, 'auth.validation.passwordRequired'),
            confirmPassword: z.string().min(1, 'auth.validation.confirmPasswordRequired'),
      })
      .refine((value) => value.password === value.confirmPassword, {
            message: 'auth.validation.passwordMismatch',
            path: ['confirmPassword'],
      });

export type RegisterFormData = z.infer<typeof registerSchema>;
