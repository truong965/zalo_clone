import { z } from 'zod';

export const loginSchema = z.object({
      phoneNumber: z.string().min(1, 'auth.validation.phoneRequired'),
      password: z.string().min(1, 'auth.validation.passwordRequired'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
