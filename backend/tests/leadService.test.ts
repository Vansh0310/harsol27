import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/repositories/leadRepository', () => ({
  insertLead: vi.fn(),
}));

vi.mock('../src/services/emailService', () => ({
  notifyNewLead: vi.fn(),
}));

import { insertLead } from '../src/repositories/leadRepository';
import { notifyNewLead } from '../src/services/emailService';
import { submitLead } from '../src/services/leadService';

const validInput = {
  fullName: 'Jane Doe',
  phoneNumber: '+919876543210',
  email: 'jane@example.com',
  businessCategory: 'manufacturing' as const,
  companyWebsite: '',
};

const context = { ip: '127.0.0.1', userAgent: 'vitest' };

describe('submitLead', () => {
  beforeEach(() => {
    vi.mocked(insertLead).mockReset();
    vi.mocked(notifyNewLead).mockReset();
  });

  it('persists the lead and fires a notification with the full lead details', async () => {
    vi.mocked(insertLead).mockResolvedValue({
      id: 'lead_1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    vi.mocked(notifyNewLead).mockResolvedValue(undefined);

    const result = await submitLead(validInput, context);

    expect(result).toEqual({ id: 'lead_1', createdAt: new Date('2026-01-01T00:00:00.000Z') });
    // Wait a tick so the fire-and-forget notification call has been made.
    await new Promise((resolve) => setImmediate(resolve));
    expect(notifyNewLead).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lead_1',
        fullName: validInput.fullName,
        email: validInput.email,
        phoneNumber: validInput.phoneNumber,
        businessCategory: validInput.businessCategory,
      }),
    );
  });

  it('resolves immediately even if the notification job is still pending', async () => {
    vi.mocked(insertLead).mockResolvedValue({
      id: 'lead_2',
      createdAt: new Date(),
    });
    // Never resolves within the test - proves submitLead does not await it.
    vi.mocked(notifyNewLead).mockReturnValue(new Promise(() => {}));

    await expect(submitLead(validInput, context)).resolves.toMatchObject({ id: 'lead_2' });
  });

  it('does not throw or reject when the notification job rejects', async () => {
    vi.mocked(insertLead).mockResolvedValue({
      id: 'lead_3',
      createdAt: new Date(),
    });
    vi.mocked(notifyNewLead).mockRejectedValue(new Error('provider down'));

    await expect(submitLead(validInput, context)).resolves.toMatchObject({ id: 'lead_3' });
    // Let the background .catch() run so it doesn't surface as an
    // unhandled rejection in a later test.
    await new Promise((resolve) => setImmediate(resolve));
  });
});
