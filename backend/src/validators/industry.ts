import { z } from 'zod';

export const createIndustrySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(80, 'Name must be at most 80 characters.'),
});

export type CreateIndustryInput = z.infer<typeof createIndustrySchema>;

// Every field optional (a PATCH), but at least one must be present - an
// empty body is almost certainly a client bug, not a deliberate no-op.
export const updateIndustrySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters.')
      .max(80, 'Name must be at most 80 characters.')
      .optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.isActive !== undefined || value.sortOrder !== undefined,
    {
      message: 'Provide at least one field to update.',
    },
  );

export type UpdateIndustryInput = z.infer<typeof updateIndustrySchema>;
