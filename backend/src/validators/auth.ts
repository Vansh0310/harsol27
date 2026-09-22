import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address.')),
  // Deliberately not enforcing a minimum length or complexity policy here:
  // this only ever checks a password someone already has (there's no public
  // registration endpoint - see scripts/create-admin.ts), and a mismatched
  // policy here would just reject correct passwords created before it changed.
  password: z.string().min(1, 'Password is required.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
