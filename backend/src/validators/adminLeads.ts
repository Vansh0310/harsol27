import { z } from 'zod';
import { BUSINESS_CATEGORY_VALUES } from './lead';

export const LEAD_STATUS_VALUES = ['new', 'contacted', 'converted', 'spam'] as const;

const LEAD_SORT_FIELDS = ['createdAt', 'fullName', 'businessCategory', 'status'] as const;

export const listLeadsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    businessCategory: z.enum(BUSINESS_CATEGORY_VALUES).optional(),
    industryId: z.uuid().optional(),
    status: z.enum(LEAD_STATUS_VALUES).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    sortBy: z.enum(LEAD_SORT_FIELDS).default('createdAt'),
    sortDir: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    message: 'dateFrom must be on or before dateTo.',
    path: ['dateFrom'],
  });

export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export const updateLeadStatusSchema = z.object({
  status: z.enum(LEAD_STATUS_VALUES, { message: 'Select a valid status.' }),
});

export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;
