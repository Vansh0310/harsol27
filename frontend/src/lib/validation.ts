import { z } from 'zod';

export const BUSINESS_CATEGORY_VALUES = [
  'manufacturing',
  'wholesale',
  'retail',
  'services',
  'trading',
  'others',
] as const;

export type BusinessCategory = (typeof BUSINESS_CATEGORY_VALUES)[number];

export const BUSINESS_CATEGORY_LABELS: Record<BusinessCategory, string> = {
  manufacturing: 'Manufacturing',
  wholesale: 'Wholesale',
  retail: 'Retail',
  services: 'Services',
  trading: 'Trading',
  others: 'Others',
};

// Admin dashboard only (Phase 6) - the public form never sets or shows a
// lead's status, so these live alongside the shared BUSINESS_CATEGORY
// constants rather than duplicating this file's structure under src/admin.
export const LEAD_STATUS_VALUES = ['new', 'contacted', 'converted', 'spam'] as const;

export type LeadStatusValue = (typeof LEAD_STATUS_VALUES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatusValue, string> = {
  new: 'New',
  contacted: 'Contacted',
  converted: 'Converted',
  spam: 'Spam',
};

// Unicode letters/marks, spaces, and the handful of punctuation marks real names use.
// Mirrors backend/src/validators/lead.ts - keep the two in sync.
const NAME_REGEX = /^[\p{L}\p{M} .'-]{2,120}$/u;

// Deliberately permissive here: an optional leading "+", 7-19 digits with
// optional spaces/hyphens. This is fast client-side feedback only - the
// backend does the real, strict parsing (libphonenumber-js) and is the
// actual source of truth, so we don't need a second heavy phone-parsing
// library in the browser bundle just to duplicate that check.
const PHONE_REGEX = /^\+?[0-9](?:[0-9 -]{5,17})[0-9]$/;

export const leadFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your full name.')
    .max(120, 'Name is too long.')
    .regex(NAME_REGEX, 'Name contains invalid characters.'),

  phoneNumber: z
    .string()
    .trim()
    .min(1, 'Enter your phone number.')
    .regex(PHONE_REGEX, 'Enter a valid phone number.'),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'Email is too long.')
    .pipe(z.email('Enter a valid email address.')),

  businessCategory: z.enum(BUSINESS_CATEGORY_VALUES, {
    message: 'Select a business category.',
  }),

  // The active industry list is fetched at runtime (see lib/industries.ts)
  // rather than a fixed Zod enum like businessCategory, since an admin can
  // add or deactivate one at any time - this only checks a value was
  // actually picked, not that it's real. The backend re-validates the id
  // against the database regardless (see backend/src/validators/lead.ts).
  industryId: z.string().min(1, 'Select an industry.'),

  // Honeypot - real users never see this input (CSS-hidden in LeadForm).
  // Left blank by humans; a filled value means a bot filled every field
  // it could find. The backend silently accepts-but-drops these.
  companyWebsite: z.string().max(200).optional().default(''),
});

export type LeadFormValues = z.infer<typeof leadFormSchema>;

// The *input* shape react-hook-form actually manages (before Zod applies
// `companyWebsite`'s default) - distinct from LeadFormValues (the parsed
// *output* the resolver hands to onSubmit) now that @hookform/resolvers
// types these separately. See LeadForm.tsx's useForm<...> call.
export type LeadFormInput = z.input<typeof leadFormSchema>;
