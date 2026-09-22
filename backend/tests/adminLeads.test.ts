import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../src/utils/jwt';
import * as adminRepository from '../src/repositories/adminRepository';
import * as leadRepository from '../src/repositories/leadRepository';

vi.mock('../src/repositories/adminRepository', () => ({
  findAdminById: vi.fn(),
}));

vi.mock('../src/repositories/leadRepository', () => ({
  listLeads: vi.fn(),
  findLeadById: vi.fn(),
  updateLeadStatus: vi.fn(),
}));

const ADMIN_ID = 'admin_1';
const ADMIN_EMAIL = 'admin@example.com';

function authCookie(tokenVersion = 0): string {
  const token = signAccessToken({ sub: ADMIN_ID, email: ADMIN_EMAIL, role: 'admin', tokenVersion });
  return `${ACCESS_TOKEN_COOKIE}=${token}`;
}

const sampleLead = {
  id: 'lead_1',
  fullName: 'Jane Doe',
  phoneNumber: '+919876543210',
  email: 'jane@example.com',
  businessCategory: 'manufacturing' as const,
  status: 'new' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

beforeEach(() => {
  vi.mocked(adminRepository.findAdminById).mockReset();
  vi.mocked(leadRepository.listLeads).mockReset();
  vi.mocked(leadRepository.findLeadById).mockReset();
  vi.mocked(leadRepository.updateLeadStatus).mockReset();

  vi.mocked(adminRepository.findAdminById).mockResolvedValue({
    id: ADMIN_ID,
    email: ADMIN_EMAIL,
    passwordHash: 'irrelevant',
    role: 'admin',
    failedLoginAttempts: 0,
    lockedUntil: null,
    tokenVersion: 0,
  });
});

describe('GET /api/leads (admin)', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });

  it('returns a paginated list for an authenticated admin', async () => {
    vi.mocked(leadRepository.listLeads).mockResolvedValue({ leads: [sampleLead], total: 1 });

    const app = createApp();
    const res = await request(app).get('/api/leads').set('Cookie', authCookie());

    expect(res.status).toBe(200);
    expect(res.body.leads).toHaveLength(1);
    expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
  });

  it('passes filters and sorting through to the repository', async () => {
    vi.mocked(leadRepository.listLeads).mockResolvedValue({ leads: [], total: 0 });

    const app = createApp();
    await request(app)
      .get('/api/leads')
      .query({
        page: 2,
        pageSize: 10,
        businessCategory: 'retail',
        status: 'contacted',
        sortBy: 'fullName',
        sortDir: 'asc',
      })
      .set('Cookie', authCookie());

    expect(leadRepository.listLeads).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 10,
        businessCategory: 'retail',
        status: 'contacted',
        sortBy: 'fullName',
        sortDir: 'asc',
      }),
    );
  });

  it('rejects an invalid businessCategory filter with a 400', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/api/leads')
      .query({ businessCategory: 'not-a-real-category' })
      .set('Cookie', authCookie());

    expect(res.status).toBe(400);
  });

  it('rejects a stale token whose tokenVersion no longer matches the database', async () => {
    vi.mocked(adminRepository.findAdminById).mockResolvedValue({
      id: ADMIN_ID,
      email: ADMIN_EMAIL,
      passwordHash: 'irrelevant',
      role: 'admin',
      failedLoginAttempts: 0,
      lockedUntil: null,
      tokenVersion: 5,
    });

    const app = createApp();
    const res = await request(app).get('/api/leads').set('Cookie', authCookie(0));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/leads/:id (admin)', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/leads/lead_1');
    expect(res.status).toBe(401);
  });

  it('returns 404 for a lead that does not exist', async () => {
    vi.mocked(leadRepository.findLeadById).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).get('/api/leads/does-not-exist').set('Cookie', authCookie());

    expect(res.status).toBe(404);
  });

  it('returns the full lead detail including status history', async () => {
    vi.mocked(leadRepository.findLeadById).mockResolvedValue({
      ...sampleLead,
      sourceIp: '127.0.0.1',
      userAgent: 'vitest',
      updatedAt: sampleLead.createdAt,
      statusHistory: [],
    });

    const app = createApp();
    const res = await request(app).get('/api/leads/lead_1').set('Cookie', authCookie());

    expect(res.status).toBe(200);
    expect(res.body.lead.id).toBe('lead_1');
    expect(res.body.lead.statusHistory).toEqual([]);
  });
});

describe('PATCH /api/leads/:id/status (admin)', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).patch('/api/leads/lead_1/status').send({ status: 'contacted' });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid status value', async () => {
    const app = createApp();
    const res = await request(app)
      .patch('/api/leads/lead_1/status')
      .set('Cookie', authCookie())
      .send({ status: 'not-a-real-status' });

    expect(res.status).toBe(400);
  });

  it('updates the status and records who made the change', async () => {
    vi.mocked(leadRepository.updateLeadStatus).mockResolvedValue({
      lead: {
        ...sampleLead,
        status: 'contacted',
        sourceIp: null,
        userAgent: null,
        updatedAt: sampleLead.createdAt,
        statusHistory: [
          {
            id: 'hist_1',
            fromStatus: 'new',
            toStatus: 'contacted',
            createdAt: sampleLead.createdAt,
            changedBy: { id: ADMIN_ID, email: ADMIN_EMAIL },
          },
        ],
      },
      changed: true,
    });

    const app = createApp();
    const res = await request(app)
      .patch('/api/leads/lead_1/status')
      .set('Cookie', authCookie())
      .send({ status: 'contacted' });

    expect(res.status).toBe(200);
    expect(res.body.lead.status).toBe('contacted');
    expect(leadRepository.updateLeadStatus).toHaveBeenCalledWith('lead_1', ADMIN_ID, 'contacted');
  });

  it('returns 404 when updating a lead that does not exist', async () => {
    vi.mocked(leadRepository.updateLeadStatus).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .patch('/api/leads/does-not-exist/status')
      .set('Cookie', authCookie())
      .send({ status: 'contacted' });

    expect(res.status).toBe(404);
  });
});
