import type { BusinessCategory, LeadStatusValue } from '../lib/validation';

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

// Re-exported under this name so admin/* files read naturally ("a lead's
// LeadStatus") without needing to know it's defined alongside the shared
// form-validation constants in lib/validation.ts.
export type LeadStatus = LeadStatusValue;

export interface AdminSession {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
}

export interface IndustryRef {
  id: string;
  name: string;
}

export interface Industry extends IndustryRef {
  slug: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeadSummary {
  id: string;
  fullName: string;
  phoneNumber: string;
  email: string;
  businessCategory: BusinessCategory;
  industry: IndustryRef | null;
  status: LeadStatus;
  createdAt: string;
}

export interface LeadStatusHistoryEntry {
  id: string;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus;
  createdAt: string;
  changedBy: { id: string; email: string };
}

export interface LeadDetail extends LeadSummary {
  sourceIp: string | null;
  userAgent: string | null;
  updatedAt: string;
  statusHistory: LeadStatusHistoryEntry[];
}

export interface PaginatedLeads {
  leads: LeadSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListLeadsParams {
  page?: number;
  pageSize?: number;
  businessCategory?: BusinessCategory;
  industryId?: string;
  status?: LeadStatus;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'createdAt' | 'fullName' | 'businessCategory' | 'status';
  sortDir?: 'asc' | 'desc';
}

/** Thrown once a 401 survives a silent refresh attempt - callers use this to
 * distinguish "not logged in" from every other kind of failure. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Not authenticated.');
    this.name = 'UnauthorizedError';
  }
}

/** Thrown for any other non-2xx response, carrying whatever the API's JSON
 * error body said so a form can show a specific, correct message. */
export class ApiError extends Error {
  public readonly status: number;
  public readonly fields?: Record<string, string[]>;

  constructor(status: number, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/** POST /api/auth/refresh, coalesced so concurrent 401s from several
 * in-flight requests trigger exactly one refresh call, not one each. */
async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

interface ApiFetchOptions extends RequestInit {
  /** Internal - prevents infinite retry loops. Never set this yourself. */
  _isRetry?: boolean;
}

/**
 * The one place every admin request goes through. On a 401 it tries exactly
 * one silent token refresh and retries the original request once; if that
 * still fails, it throws UnauthorizedError so RequireAuth can redirect to
 * the login page instead of a screen full of broken widgets.
 */
async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { _isRetry, headers, ...rest } = options;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headers },
  });

  if (res.status === 401 && !_isRetry && path !== '/api/auth/refresh') {
    const refreshed = await refreshSession();
    if (refreshed) {
      return apiFetch(path, { ...options, _isRetry: true });
    }
    throw new UnauthorizedError();
  }

  return res;
}

async function parseErrorBody(
  res: Response,
): Promise<{ message: string; fields?: Record<string, string[]> }> {
  const body = (await res.json().catch(() => ({}))) as {
    message?: string;
    fields?: Record<string, string[]>;
  };
  return {
    message: body.message ?? 'Something went wrong. Please try again.',
    fields: body.fields,
  };
}

export async function login(email: string, password: string): Promise<AdminSession> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const { message, fields } = await parseErrorBody(res);
    throw new ApiError(res.status, message, fields);
  }

  const body = (await res.json()) as { admin: AdminSession };
  return body.admin;
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
}

/** Returns null for "not logged in" rather than throwing - this is used on
 * every app load just to find out whether a session exists. */
export async function getCurrentAdmin(): Promise<AdminSession | null> {
  try {
    const res = await apiFetch('/api/auth/me');
    if (!res.ok) return null;
    const body = (await res.json()) as { admin: AdminSession };
    return body.admin;
  } catch {
    return null;
  }
}

export async function listLeads(params: ListLeadsParams): Promise<PaginatedLeads> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }

  const res = await apiFetch(`/api/leads?${query.toString()}`);
  if (!res.ok) {
    const { message } = await parseErrorBody(res);
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as PaginatedLeads;
}

export async function getLead(id: string): Promise<LeadDetail> {
  const res = await apiFetch(`/api/leads/${encodeURIComponent(id)}`);
  if (!res.ok) {
    const { message } = await parseErrorBody(res);
    throw new ApiError(res.status, message);
  }
  const body = (await res.json()) as { lead: LeadDetail };
  return body.lead;
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<LeadDetail> {
  const res = await apiFetch(`/api/leads/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const { message } = await parseErrorBody(res);
    throw new ApiError(res.status, message);
  }
  const body = (await res.json()) as { lead: LeadDetail };
  return body.lead;
}

/** GET /api/industries/all - every industry, active or not (management screen). */
export async function listAllIndustries(): Promise<Industry[]> {
  const res = await apiFetch('/api/industries/all');
  if (!res.ok) {
    const { message } = await parseErrorBody(res);
    throw new ApiError(res.status, message);
  }
  const body = (await res.json()) as { industries: Industry[] };
  return body.industries;
}

export async function createIndustry(name: string): Promise<Industry> {
  const res = await apiFetch('/api/industries', { method: 'POST', body: JSON.stringify({ name }) });
  if (!res.ok) {
    const { message, fields } = await parseErrorBody(res);
    throw new ApiError(res.status, message, fields);
  }
  const body = (await res.json()) as { industry: Industry };
  return body.industry;
}

export interface UpdateIndustryInput {
  name?: string;
  isActive?: boolean;
  sortOrder?: number;
}

export async function updateIndustry(id: string, input: UpdateIndustryInput): Promise<Industry> {
  const res = await apiFetch(`/api/industries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const { message, fields } = await parseErrorBody(res);
    throw new ApiError(res.status, message, fields);
  }
  const body = (await res.json()) as { industry: Industry };
  return body.industry;
}
