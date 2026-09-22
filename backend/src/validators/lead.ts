import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { z } from 'zod';

// Unicode letters/marks, spaces, and the handful of punctuation marks real names use.
const NAME_REGEX = /^[\p{L}\p{M} .'-]{2,120}$/u;

export const BUSINESS_CATEGORY_VALUES = [
  'manufacturing',
  'wholesale',
  'retail',
  'services',
  'trading',
  'others',
] as const;

export const createLeadSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(120, 'Full name must be at most 120 characters.')
    .regex(NAME_REGEX, 'Full name contains invalid characters.'),

  phoneNumber: z
    .string()
    .trim()
    .min(1, 'Phone number is required.')
    .transform((value, ctx) => {
      // Default to India since that's this app's primary market, but a caller
      // can still submit a fully international number (e.g. +1...).
      const parsed = parsePhoneNumberFromString(value, 'IN');
      if (!parsed || !parsed.isValid()) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number.' });
        return z.NEVER;
      }
      return parsed.format('E.164');
    }),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'Email must be at most 254 characters.')
    .pipe(z.email('Enter a valid email address.')),

  businessCategory: z.enum(BUSINESS_CATEGORY_VALUES, {
    message: 'Select a valid business category.',
  }),

  // Honeypot: a real visitor never sees this field (hidden via CSS on the
  // frontend). Any non-empty value here marks the submission as a bot -
  // handled in the controller, which returns success without persisting it.
  companyWebsite: z.string().max(200).optional().default(''),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
