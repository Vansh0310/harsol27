import type { LeadFormValues } from './validation';

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export interface SubmitLeadResponse {
  id: string;
  createdAt: string;
}

export type SubmitLeadError =
  | { kind: 'validation'; fields: Record<string, string[]> }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'network' }
  | { kind: 'unknown'; message: string };

export type SubmitLeadResult =
  { ok: true; data: SubmitLeadResponse } | { ok: false; error: SubmitLeadError };

async function postLead(payload: LeadFormValues): Promise<Response> {
  return fetch(`${API_BASE_URL}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Submits the form. A single short-backoff retry covers a transient network
 * blip (a dropped wifi packet, a cold serverless function) without turning
 * a real outage into a slow, repeated hammering of the API.
 */
export async function submitLead(payload: LeadFormValues): Promise<SubmitLeadResult> {
  let response: Response;
  try {
    response = await postLead(payload);
  } catch {
    await new Promise((resolve) => {
      setTimeout(resolve, 800);
    });
    try {
      response = await postLead(payload);
    } catch {
      return { ok: false, error: { kind: 'network' } };
    }
  }

  if (response.status === 201) {
    const data = (await response.json()) as SubmitLeadResponse;
    return { ok: true, data };
  }

  if (response.status === 400) {
    const body = (await response.json().catch(() => ({}))) as { fields?: Record<string, string[]> };
    return { ok: false, error: { kind: 'validation', fields: body.fields ?? {} } };
  }

  if (response.status === 429) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    return {
      ok: false,
      error: {
        kind: 'rate_limited',
        message: body.message ?? 'Too many attempts. Please try again later.',
      },
    };
  }

  const body = (await response.json().catch(() => ({}))) as { message?: string };
  return {
    ok: false,
    error: { kind: 'unknown', message: body.message ?? 'Something went wrong. Please try again.' },
  };
}
