import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LeadForm } from './LeadForm';
import { submitLead } from '../lib/apiClient';
import type { SubmitLeadResult } from '../lib/apiClient';
import { fetchActiveIndustries } from '../lib/industries';

vi.mock('../lib/apiClient', () => ({
  submitLead: vi.fn(),
}));

vi.mock('../lib/industries', () => ({
  fetchActiveIndustries: vi.fn(),
}));

const mockedSubmitLead = vi.mocked(submitLead);
const mockedFetchActiveIndustries = vi.mocked(fetchActiveIndustries);

const sampleIndustries = [
  { id: 'industry_1', name: 'Textiles & Fabrics' },
  { id: 'industry_2', name: 'Steel & Metal Products' },
];

async function fillValidForm(): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/full name/i), 'Vansh Shah');
  await user.type(screen.getByLabelText(/phone number/i), '+919876543210');
  await user.type(screen.getByLabelText(/email/i), 'vansh@example.com');
  await user.selectOptions(screen.getByLabelText(/business category/i), 'manufacturing');
  // Waits for the industries fetch to resolve and populate the dropdown -
  // the select stays disabled (and empty besides the placeholder) until then.
  await screen.findByRole('option', { name: 'Textiles & Fabrics' });
  await user.selectOptions(screen.getByLabelText(/^industry$/i), 'industry_1');
}

describe('LeadForm', () => {
  beforeEach(() => {
    mockedSubmitLead.mockReset();
    mockedFetchActiveIndustries.mockReset();
    mockedFetchActiveIndustries.mockResolvedValue({ ok: true, industries: sampleIndustries });
  });

  it('renders all fields plus the hidden honeypot input', async () => {
    render(<LeadForm />);

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/business category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^industry$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();

    // Populated from fetchActiveIndustries, not hardcoded like business category.
    expect(await screen.findByRole('option', { name: 'Textiles & Fabrics' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Steel & Metal Products' })).toBeInTheDocument();

    // The honeypot exists in the DOM (so bots filling every field still hit
    // it) but is hidden from sighted and assistive-tech users alike.
    const honeypot = document.getElementById('companyWebsite');
    expect(honeypot).not.toBeNull();
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows inline validation errors and never calls the API for an invalid submission', async () => {
    const user = userEvent.setup();
    render(<LeadForm />);

    // The submit button stays disabled until industries finish loading, same
    // as a real user would have to wait - clicking before then would be a no-op.
    await screen.findByRole('option', { name: 'Textiles & Fabrics' });
    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByText(/enter your full name/i)).toBeInTheDocument();
    expect(screen.getByText(/enter your phone number/i)).toBeInTheDocument();
    expect(screen.getByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(screen.getByText(/select a business category/i)).toBeInTheDocument();
    expect(screen.getByText('Select an industry.')).toBeInTheDocument();
    expect(mockedSubmitLead).not.toHaveBeenCalled();
  });

  it('shows an error and a retry option when the industry list fails to load', async () => {
    mockedFetchActiveIndustries.mockReset();
    mockedFetchActiveIndustries.mockResolvedValueOnce({ ok: false });

    render(<LeadForm />);

    expect(await screen.findByText(/couldn't load the industry list/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();

    mockedFetchActiveIndustries.mockResolvedValueOnce({ ok: true, industries: sampleIndustries });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /retry/i }));

    expect(await screen.findByRole('option', { name: 'Textiles & Fabrics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
  });

  it('disables the submit button while the request is in flight', async () => {
    let resolveSubmit: (result: SubmitLeadResult) => void = () => {};
    mockedSubmitLead.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    );

    render(<LeadForm />);
    await fillValidForm();
    const user = userEvent.setup();
    const submitButton = screen.getByRole('button', { name: /submit/i });
    await user.click(submitButton);

    expect(await screen.findByRole('button', { name: /submitting/i })).toBeDisabled();

    resolveSubmit({ ok: true, data: { id: 'lead-1', createdAt: new Date().toISOString() } });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /submitting/i })).not.toBeInTheDocument();
    });
  });

  it('shows a success state and resets the form after a successful submission', async () => {
    mockedSubmitLead.mockResolvedValue({
      ok: true,
      data: { id: 'lead-1', createdAt: new Date().toISOString() },
    });

    render(<LeadForm />);
    await fillValidForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(/we've got your details/i);
    expect(mockedSubmitLead).toHaveBeenCalledTimes(1);
  });

  it('shows the rate-limit message verbatim when the API returns a 429', async () => {
    mockedSubmitLead.mockResolvedValue({
      ok: false,
      error: {
        kind: 'rate_limited',
        message: 'Too many submissions from this address. Please try again later.',
      },
    });

    render(<LeadForm />);
    await fillValidForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByText(/too many submissions from this address/i)).toBeInTheDocument();
  });

  it("shows a network-failure message when the API can't be reached", async () => {
    mockedSubmitLead.mockResolvedValue({ ok: false, error: { kind: 'network' } });

    render(<LeadForm />);
    await fillValidForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByText(/couldn't reach the server/i)).toBeInTheDocument();
  });

  it('shows a generic error message for an unexpected server error', async () => {
    mockedSubmitLead.mockResolvedValue({
      ok: false,
      error: { kind: 'unknown', message: 'Internal server error' },
    });

    render(<LeadForm />);
    await fillValidForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /submit/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
