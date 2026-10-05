import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { ACCESS_TOKEN_COOKIE, signAccessToken } from '../src/utils/jwt';
import * as adminRepository from '../src/repositories/adminRepository';
import * as industryRepository from '../src/repositories/industryRepository';
import { Prisma } from '../generated/prisma/client';

vi.mock('../src/repositories/adminRepository', () => ({
  findAdminById: vi.fn(),
}));

vi.mock('../src/repositories/industryRepository', () => ({
  listActiveIndustries: vi.fn(),
  listAllIndustries: vi.fn(),
  createIndustry: vi.fn(),
  updateIndustry: vi.fn(),
}));

const ADMIN_ID = 'admin_1';
const ADMIN_EMAIL = 'admin@example.com';

function cookieFor(role: 'admin' | 'viewer', tokenVersion = 0): string {
  const token = signAccessToken({ sub: ADMIN_ID, email: ADMIN_EMAIL, role, tokenVersion });
  return `${ACCESS_TOKEN_COOKIE}=${token}`;
}

const sampleIndustry = {
  id: 'industry_1',
  name: 'Textiles & Fabrics',
  slug: 'textiles-fabrics',
  isActive: true,
  sortOrder: 10,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function mockAdmin(role: 'admin' | 'viewer'): void {
  vi.mocked(adminRepository.findAdminById).mockResolvedValue({
    id: ADMIN_ID,
    email: ADMIN_EMAIL,
    passwordHash: 'irrelevant',
    role,
    failedLoginAttempts: 0,
    lockedUntil: null,
    tokenVersion: 0,
  });
}

beforeEach(() => {
  vi.mocked(adminRepository.findAdminById).mockReset();
  vi.mocked(industryRepository.listActiveIndustries).mockReset();
  vi.mocked(industryRepository.listAllIndustries).mockReset();
  vi.mocked(industryRepository.createIndustry).mockReset();
  vi.mocked(industryRepository.updateIndustry).mockReset();
});

describe('GET /api/industries (public)', () => {
  it('requires no authentication and returns only active industries', async () => {
    vi.mocked(industryRepository.listActiveIndustries).mockResolvedValue([sampleIndustry]);

    const app = createApp();
    const res = await request(app).get('/api/industries');

    expect(res.status).toBe(200);
    expect(res.body.industries).toEqual(
      [sampleIndustry].map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
    );
  });
});

describe('GET /api/industries/all (admin)', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).get('/api/industries/all');
    expect(res.status).toBe(401);
  });

  it('is visible to a viewer, not just an admin', async () => {
    mockAdmin('viewer');
    vi.mocked(industryRepository.listAllIndustries).mockResolvedValue([sampleIndustry]);

    const app = createApp();
    const res = await request(app).get('/api/industries/all').set('Cookie', cookieFor('viewer'));

    expect(res.status).toBe(200);
    expect(res.body.industries).toHaveLength(1);
  });
});

describe('POST /api/industries (admin role only)', () => {
  it('requires authentication', async () => {
    const app = createApp();
    const res = await request(app).post('/api/industries').send({ name: 'Steel' });
    expect(res.status).toBe(401);
  });

  it('forbids a viewer from creating an industry', async () => {
    mockAdmin('viewer');

    const app = createApp();
    const res = await request(app)
      .post('/api/industries')
      .set('Cookie', cookieFor('viewer'))
      .send({ name: 'Steel & Metal Products' });

    expect(res.status).toBe(403);
    expect(industryRepository.createIndustry).not.toHaveBeenCalled();
  });

  it('creates an industry for an admin', async () => {
    mockAdmin('admin');
    vi.mocked(industryRepository.listAllIndustries).mockResolvedValue([]);
    vi.mocked(industryRepository.createIndustry).mockResolvedValue({
      ...sampleIndustry,
      name: 'Steel & Metal Products',
      slug: 'steel-metal-products',
    });

    const app = createApp();
    const res = await request(app)
      .post('/api/industries')
      .set('Cookie', cookieFor('admin'))
      .send({ name: 'Steel & Metal Products' });

    expect(res.status).toBe(201);
    expect(res.body.industry.name).toBe('Steel & Metal Products');
    expect(industryRepository.createIndustry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Steel & Metal Products', slug: 'steel-metal-products' }),
    );
  });

  it('rejects a name shorter than 2 characters', async () => {
    mockAdmin('admin');

    const app = createApp();
    const res = await request(app)
      .post('/api/industries')
      .set('Cookie', cookieFor('admin'))
      .send({ name: 'A' });

    expect(res.status).toBe(400);
    expect(industryRepository.createIndustry).not.toHaveBeenCalled();
  });

  it('returns 409 when the name (or its slug) already exists', async () => {
    mockAdmin('admin');
    vi.mocked(industryRepository.listAllIndustries).mockResolvedValue([]);
    vi.mocked(industryRepository.createIndustry).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['name'] },
      }),
    );

    const app = createApp();
    const res = await request(app)
      .post('/api/industries')
      .set('Cookie', cookieFor('admin'))
      .send({ name: 'Textiles & Fabrics' });

    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/industries/:id (admin role only)', () => {
  it('forbids a viewer from updating an industry', async () => {
    mockAdmin('viewer');

    const app = createApp();
    const res = await request(app)
      .patch('/api/industries/industry_1')
      .set('Cookie', cookieFor('viewer'))
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(industryRepository.updateIndustry).not.toHaveBeenCalled();
  });

  it('deactivates an industry for an admin', async () => {
    mockAdmin('admin');
    vi.mocked(industryRepository.updateIndustry).mockResolvedValue({
      ...sampleIndustry,
      isActive: false,
    });

    const app = createApp();
    const res = await request(app)
      .patch('/api/industries/industry_1')
      .set('Cookie', cookieFor('admin'))
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.industry.isActive).toBe(false);
  });

  it('returns 404 for an industry that does not exist', async () => {
    mockAdmin('admin');
    vi.mocked(industryRepository.updateIndustry).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .patch('/api/industries/does-not-exist')
      .set('Cookie', cookieFor('admin'))
      .send({ isActive: false });

    expect(res.status).toBe(404);
  });

  it('rejects an empty update body', async () => {
    mockAdmin('admin');

    const app = createApp();
    const res = await request(app)
      .patch('/api/industries/industry_1')
      .set('Cookie', cookieFor('admin'))
      .send({});

    expect(res.status).toBe(400);
    expect(industryRepository.updateIndustry).not.toHaveBeenCalled();
  });
});
