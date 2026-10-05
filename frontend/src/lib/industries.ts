const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export interface IndustryOption {
  id: string;
  name: string;
}

export type FetchIndustriesResult = { ok: true; industries: IndustryOption[] } | { ok: false };

/**
 * GET /api/industries (public, active-only) for the lead form's dropdown.
 * Failure collapses to a single `{ ok: false }` rather than distinguishing
 * network/parse/HTTP-status errors the way apiClient.ts's submitLead does -
 * LeadForm only has one thing to do differently either way (show a retry
 * message and keep the form disabled), so a richer error shape would be
 * unused complexity.
 */
export async function fetchActiveIndustries(): Promise<FetchIndustriesResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/industries`);
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { industries: IndustryOption[] };
    return { ok: true, industries: body.industries };
  } catch {
    return { ok: false };
  }
}
