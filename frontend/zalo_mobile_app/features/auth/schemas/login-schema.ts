import { z } from 'zod';
import { PHONE_REGEX } from '@/constants/validation';

export const loginSchema = z.object({
      phoneNumber: z.string().min(1, 'auth.validation.phoneRequired').regex(PHONE_REGEX, 'auth.validation.invalidPhoneNumber'),
      password: z.string().min(1, 'auth.validation.passwordRequired'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
