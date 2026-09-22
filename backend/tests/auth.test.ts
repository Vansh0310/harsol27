import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { hashPassword } from '../src/utils/password';
import * as adminRepository from '../src/repositories/adminRepository';

vi.mock('../src/repositories/adminRepository', () => ({
  findAdminByEmail: vi.fn(),
  findAdminById: vi.fn(),
  recordFailedLogin: vi.fn(),
  resetFailedLogins: vi.fn(),
  bumpTokenVersion: vi.fn(),
  upsertAdmin: vi.fn(),
}));

const ADMIN_ID = 'admin_1';
const ADMIN_EMAIL = 'admin@example.com';
const PLAIN_PASSWORD = 'a very strong passphrase';

let passwordHash: string;

function baseAdmin(overrides: Partial<adminRepository.AdminUserRecord> = {}) {
  return {
    id: ADMIN_ID,
    email: ADMIN_EMAIL,
    passwordHash,
    role: 'admin' as const,
    failedLoginAttempts: 0,
    lockedUntil: null,
    tokenVersion: 0,
    ...overrides,
  };
}

function findRawCookie(setCookieHeader: string[] | undefined, name: string): string | undefined {
  return setCookieHeader?.find((c) => c.startsWith(`${name}=`));
}

function extractCookie(setCookieHeader: string[] | undefined, name: string): string | undefined {
  return findRawCookie(setCookieHeader, name)?.split(';')[0];
}

beforeAll(async () => {
  passwordHash = await hashPassword(PLAIN_PASSWORD);
});

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.mocked(adminRepository.findAdminByEmail).mockReset();
    vi.mocked(adminRepository.recordFailedLogin).mockReset();
    vi.mocked(adminRepository.resetFailedLogins).mockReset();
  });

  it('logs in with correct credentials and sets httpOnly session cookies', async () => {
    vi.mocked(adminRepository.findAdminByEmail).mockResolvedValue(baseAdmin());

    const app = createApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: PLAIN_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.admin).toEqual({ id: ADMIN_ID, email: ADMIN_EMAIL, role: 'admin' });

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(findRawCookie(setCookie, 'access_token')).toContain('HttpOnly');
    expect(findRawCookie(setCookie, 'refresh_token')).toContain('HttpOnly');
    expect(adminRepository.resetFailedLogins).toHaveBeenCalledWith(ADMIN_ID);
  });

  it('rejects a wrong password without revealing whether that was the issue', async () => {
    vi.mocked(adminRepository.findAdminByEmail).mockResolvedValue(baseAdmin());

    const app = createApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'the wrong password entirely' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
    expect(adminRepository.recordFailedLogin).toHaveBeenCalledWith(
      ADMIN_ID,
      expect.any(Number),
      expect.any(Date),
    );
  });

  it('rejects an unknown email with the identical error as a wrong password', async () => {
    vi.mocked(adminRepository.findAdminByEmail).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'anything at all here' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password.');
  });

  it('rejects login while the account is locked, even with the right password', async () => {
    vi.mocked(adminRepository.findAdminByEmail).mockResolvedValue(
      baseAdmin({ lockedUntil: new Date(Date.now() + 60_000) }),
    );

    const app = createApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: PLAIN_PASSWORD });

    expect(res.status).toBe(423);
  });

  it('rejects a malformed request body with a 400, not a 500', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
  });
});

describe('session lifecycle: login -> me -> refresh -> logout', () => {
  beforeEach(() => {
    vi.mocked(adminRepository.findAdminByEmail).mockReset();
    vi.mocked(adminRepository.findAdminById).mockReset();
    vi.mocked(adminRepository.bumpTokenVersion).mockReset();
  });

  it('GET /api/auth/me returns 401 without a session cookie', async () => {
    const app = createApp();
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me succeeds with a valid access token cookie', async () => {
    vi.mocked(adminRepository.findAdminByEmail).mockResolvedValue(baseAdmin());
    vi.mocked(adminRepository.findAdminById).mockResolvedValue(baseAdmin());

    const app = createApp();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: PLAIN_PASSWORD });
    const accessCookie = extractCookie(
      loginRes.headers['set-cookie'] as unknown as string[],
      'access_token',
    );

    const meRes = await request(app).get('/api/auth/me').set('Cookie', accessCookie!);
    expect(meRes.status).toBe(200);
    expect(meRes.body.admin).toEqual({ id: ADMIN_ID, email: ADMIN_EMAIL, role: 'admin' });
  });

  it('GET /api/auth/me returns 401 once tokenVersion no longer matches (revoked)', async () => {
    vi.mocked(adminRepository.findAdminByEmail).mockResolvedValue(baseAdmin());
    // The DB now reports a higher tokenVersion than the one embedded in the
    // cookie issued at login - simulating a logout/revocation elsewhere.
    vi.mocked(adminRepository.findAdminById).mockResolvedValue(baseAdmin({ tokenVersion: 1 }));

    const app = createApp();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: PLAIN_PASSWORD });
    const accessCookie = extractCookie(
      loginRes.headers['set-cookie'] as unknown as string[],
      'access_token',
    );

    const meRes = await request(app).get('/api/auth/me').set('Cookie', accessCookie!);
    expect(meRes.status).toBe(401);
  });

  it('POST /api/auth/refresh issues a fresh access token from a valid refresh cookie', async () => {
    vi.mocked(adminRepository.findAdminByEmail).mockResolvedValue(baseAdmin());
    vi.mocked(adminRepository.findAdminById).mockResolvedValue(baseAdmin());

    const app = createApp();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: PLAIN_PASSWORD });
    const refreshCookie = extractCookie(
      loginRes.headers['set-cookie'] as unknown as string[],
      'refresh_token',
    );

    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie!);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.admin.id).toBe(ADMIN_ID);
  });

  it('POST /api/auth/refresh fails without a refresh cookie', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/logout clears both cookies and bumps tokenVersion', async () => {
    vi.mocked(adminRepository.findAdminByEmail).mockResolvedValue(baseAdmin());
    vi.mocked(adminRepository.bumpTokenVersion).mockResolvedValue(1);

    const app = createApp();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: PLAIN_PASSWORD });
    const cookies = loginRes.headers['set-cookie'] as unknown as string[];

    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', cookies.join('; '));
    expect(logoutRes.status).toBe(200);
    expect(adminRepository.bumpTokenVersion).toHaveBeenCalledWith(ADMIN_ID);

    const clearedCookies = logoutRes.headers['set-cookie'] as unknown as string[];
    expect(findRawCookie(clearedCookies, 'access_token')).toMatch(/^access_token=;/);
    expect(findRawCookie(clearedCookies, 'refresh_token')).toMatch(/^refresh_token=;/);
  });

  it('POST /api/auth/logout is idempotent (no session, still 200)', async () => {
    const app = createApp();
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(adminRepository.bumpTokenVersion).not.toHaveBeenCalled();
  });
});
