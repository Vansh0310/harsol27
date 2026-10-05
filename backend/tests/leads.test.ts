import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import * as leadRepository from '../src/repositories/leadRepository';
import * as industryRepository from '../src/repositories/industryRepository';

// Never hit the real database from this test file - only prove the HTTP
// layer (validation, rate limiting, honeypot, response shape) behaves.
vi.mock('../src/repositories/leadRepository', () => ({
  insertLead: vi.fn(),
}));

vi.mock('../src/repositories/industryRepository', () => ({
  findIndustryById: vi.fn(),
  isActiveIndustryId: vi.fn(),
}));

// Never hit a real email provider from this test file either - leadService
// fires notifications in the background, but they must stay mocked/inert
// here so tests stay hermetic and don't depend on network or credentials.
vi.mock('../src/services/emailService', () => ({
  notifyNewLead: vi.fn().mockResolvedValue(undefined),
}));

const activeIndustry = {
  id: 'a4b1c0e0-1111-4a11-8a11-000000000001',
  name: 'Textiles & Fabrics',
  slug: 'textiles-fabrics',
  isActive: true,
  sortOrder: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validPayload = {
  fullName: 'Vansh Shah',
  phoneNumber: '9876543210',
  email: 'Vansh@Example.com',
  businessCategory: 'manufacturing',
  industryId: activeIndustry.id,
};

describe('POST /api/leads', () => {
  beforeEach(() => {
    vi.mocked(leadRepository.insertLead).mockReset();
    vi.mocked(industryRepository.findIndustryById).mockReset();
    vi.mocked(industryRepository.findIndustryById).mockResolvedValue(activeIndustry);
  });

  it('creates a lead, normalizing email and phone number', async () => {
    vi.mocked(leadRepository.insertLead).mockResolvedValue({
      id: 'lead_123',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const app = createApp();
    const res = await request(app).post('/api/leads').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('lead_123');
    expect(leadRepository.insertLead).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'vansh@example.com',
        phoneNumber: '+919876543210',
        businessCategory: 'manufacturing',
        industryId: activeIndustry.id,
      }),
    );
  });

  it('rejects an invalid email with a 400 and field-level errors', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/leads')
      .send({ ...validPayload, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(res.body.fields.email).toBeDefined();
    expect(leadRepository.insertLead).not.toHaveBeenCalled();
  });

  it('rejects an invalid business category', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/leads')
      .send({ ...validPayload, businessCategory: 'not-a-real-category' });

    expect(res.status).toBe(400);
    expect(res.body.fields.businessCategory).toBeDefined();
  });

  it('rejects a malformed industryId', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/leads')
      .send({ ...validPayload, industryId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(res.body.fields.industryId).toBeDefined();
    expect(leadRepository.insertLead).not.toHaveBeenCalled();
  });

  it('rejects a well-formed industryId that does not exist or is inactive', async () => {
    vi.mocked(industryRepository.findIndustryById).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app).post('/api/leads').send(validPayload);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid industry/i);
    expect(leadRepository.insertLead).not.toHaveBeenCalled();
  });

  it('rejects an unparseable phone number', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/leads')
      .send({ ...validPayload, phoneNumber: '123' });

    expect(res.status).toBe(400);
    expect(res.body.fields.phoneNumber).toBeDefined();
  });

  it('accepts a honeypot-triggered submission but never persists it', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/api/leads')
      .send({ ...validPayload, companyWebsite: 'https://spambot.example' });

    expect(res.status).toBe(201);
    expect(leadRepository.insertLead).not.toHaveBeenCalled();
  });

  it('rate limits repeated submissions from the same client', async () => {
    vi.mocked(leadRepository.insertLead).mockResolvedValue({
      id: 'lead_x',
      createdAt: new Date(),
    });
    const app = createApp();

    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/leads').send(validPayload);
    }
    const res = await request(app).post('/api/leads').send(validPayload);

    expect(res.status).toBe(429);
  });
});
