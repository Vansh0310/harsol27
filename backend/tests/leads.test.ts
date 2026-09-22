import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import * as leadRepository from '../src/repositories/leadRepository';

// Never hit the real database from this test file - only prove the HTTP
// layer (validation, rate limiting, honeypot, response shape) behaves.
vi.mock('../src/repositories/leadRepository', () => ({
  insertLead: vi.fn(),
}));

// Never hit a real email provider from this test file either - leadService
// fires notifications in the background, but they must stay mocked/inert
// here so tests stay hermetic and don't depend on network or credentials.
vi.mock('../src/services/emailService', () => ({
  notifyNewLead: vi.fn().mockResolvedValue(undefined),
}));

const validPayload = {
  fullName: 'Vansh Shah',
  phoneNumber: '9876543210',
  email: 'Vansh@Example.com',
  businessCategory: 'manufacturing',
};

describe('POST /api/leads', () => {
  beforeEach(() => {
    vi.mocked(leadRepository.insertLead).mockReset();
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
