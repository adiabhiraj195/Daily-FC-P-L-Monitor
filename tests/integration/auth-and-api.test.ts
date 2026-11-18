import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../apps/api/src/app.js';
import { PrismaClient } from '@prisma/client';

describe('Auth & API Authorization Integration Tests', () => {
  const app = createApp();
  const prisma = new PrismaClient();

  let adminCookie: string;
  let financeCookie: string;
  let delhiManagerCookie: string;
  let delhiFcId: string;
  let blrFcId: string;

  beforeAll(async () => {
    // Fetch seeded FCs
    const delhi = await prisma.fulfilmentCentre.findUnique({ where: { code: 'FC-DEL-01' } });
    const blr = await prisma.fulfilmentCentre.findUnique({ where: { code: 'FC-BLR-01' } });
    delhiFcId = delhi!.id;
    blrFcId = blr!.id;

    // Login as Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@prozo.com', password: 'Password@123' });
    expect(adminRes.status).toBe(200);
    adminCookie = adminRes.headers['set-cookie'][0];

    // Login as Finance
    const financeRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'finance@prozo.com', password: 'Password@123' });
    expect(financeRes.status).toBe(200);
    financeCookie = financeRes.headers['set-cookie'][0];

    // Login as Delhi FC Manager
    const managerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager.delhi@prozo.com', password: 'Password@123' });
    expect(managerRes.status).toBe(200);
    delhiManagerCookie = managerRes.headers['set-cookie'][0];
  });

  it('GET /health/live and /health/ready return 200 OK', async () => {
    const live = await request(app).get('/health/live');
    expect(live.status).toBe(200);
    expect(live.body.status).toBe('live');

    const ready = await request(app).get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.database).toBe('connected');
  });

  it('FC Manager can access assigned Delhi FC', async () => {
    const res = await request(app)
      .get(`/api/v1/fcs/${delhiFcId}`)
      .set('Cookie', delhiManagerCookie);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('FC-DEL-01');
  });

  it('FC Manager is FORBIDDEN (403) from accessing unassigned Bangalore FC', async () => {
    const res = await request(app)
      .get(`/api/v1/fcs/${blrFcId}`)
      .set('Cookie', delhiManagerCookie);

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden/);
  });

  it('Finance Controller can access any FC (Delhi and Bangalore)', async () => {
    const delhiRes = await request(app)
      .get(`/api/v1/fcs/${delhiFcId}`)
      .set('Cookie', financeCookie);
    expect(delhiRes.status).toBe(200);

    const blrRes = await request(app)
      .get(`/api/v1/fcs/${blrFcId}`)
      .set('Cookie', financeCookie);
    expect(blrRes.status).toBe(200);
  });

  it('Non-admin users cannot create Target Rules (403)', async () => {
    const res = await request(app)
      .post('/api/v1/target-rules')
      .set('Cookie', financeCookie)
      .send({
        metricKey: 'MANPOWER',
        minPct: '14.0',
        maxPct: '18.0',
        effectiveFrom: '2026-01-01'
      });

    expect(res.status).toBe(403);
  });
});
