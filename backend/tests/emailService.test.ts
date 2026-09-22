import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSend = vi.fn();

vi.mock('resend', () => ({
  // A plain function, not an arrow function: vi.fn().mockImplementation()
  // invokes this via `new`, and arrow functions have no [[Construct]] slot.
  Resend: vi.fn().mockImplementation(function MockResend() {
    return { emails: { send: mockSend } };
  }),
}));

// emailService reads EMAIL_FROM/ADMIN_NOTIFICATION_EMAIL from env at call
// time via the shared `env` module, which is already populated from the
// real .env in this workspace - no need to re-mock it here.
import { notifyNewLead } from '../src/services/emailService';

const baseLead = {
  id: 'lead_123',
  fullName: 'Jane Doe',
  email: 'jane@example.com',
  phoneNumber: '+919876543210',
  businessCategory: 'manufacturing' as const,
  createdAt: new Date('2026-01-01T10:00:00.000Z'),
};

describe('notifyNewLead', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('sends both an admin alert and a submitter confirmation', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

    await notifyNewLead(baseLead);

    expect(mockSend).toHaveBeenCalledTimes(2);
    const recipients = mockSend.mock.calls.map((call) => call[0].to);
    expect(recipients).toContain(baseLead.email);
  });

  it('includes the lead details in the admin alert content', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

    await notifyNewLead(baseLead);

    const adminCall = mockSend.mock.calls.find((call) => call[0].to !== baseLead.email);
    expect(adminCall).toBeDefined();
    expect(adminCall![0].text).toContain('Jane Doe');
    expect(adminCall![0].text).toContain(baseLead.id);
    expect(adminCall![0].html).toContain('Jane Doe');
  });

  it('never throws when the provider returns an error object', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'domain not verified', statusCode: 403, name: 'validation_error' },
    });

    await expect(notifyNewLead(baseLead)).resolves.toBeUndefined();
  });

  it('never throws when the provider call itself rejects (network failure)', async () => {
    mockSend.mockRejectedValue(new Error('ECONNRESET'));

    await expect(notifyNewLead(baseLead)).resolves.toBeUndefined();
  });

  it('sends the two emails independently - one failing does not stop the other', async () => {
    mockSend
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ data: { id: 'msg_2' }, error: null });

    await expect(notifyNewLead(baseLead)).resolves.toBeUndefined();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('escapes HTML in user-supplied fields to prevent injection into the email body', async () => {
    mockSend.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

    await notifyNewLead({
      ...baseLead,
      fullName: '<img src=x onerror=alert(1)>',
    });

    for (const call of mockSend.mock.calls) {
      expect(call[0].html).not.toContain('<img src=x onerror=alert(1)>');
    }
  });
});
