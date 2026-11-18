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

  // --- Admin User Creation & RBAC Provisioning Tests ---
  it('Admin can provision a new manager ID along with a new Fulfilment Centre', async () => {
    const uniqueEmail = `manager.pune.${Date.now()}@prozo.com`;
    const uniqueCode = `FC-PUN-${Date.now().toString().slice(-4)}`;

    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', adminCookie)
      .send({
        name: 'Vikas Patil (Pune FC)',
        email: uniqueEmail,
        password: 'Password@123',
        role: 'FC_MANAGER',
        newFC: {
          code: uniqueCode,
          name: 'Pune Fulfilment Centre',
          location: 'Chakan MIDC',
          currency: 'INR'
        }
      });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe(uniqueEmail);
    expect(res.body.role).toBe('FC_MANAGER');
    expect(res.body.assignedFC).toBeDefined();
    expect(res.body.assignedFC.code).toBe(uniqueCode);

    // Verify manager can login with new credentials
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail, password: 'Password@123' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe('FC_MANAGER');
    expect(loginRes.body.user.assignedFcIds).toContain(res.body.assignedFC.id);
  });

  it('Non-admin users (FC Manager) cannot provision new user accounts (403)', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Cookie', delhiManagerCookie)
      .send({
        name: 'Unauthorized User',
        email: 'hacker@prozo.com',
        password: 'Password@123',
        role: 'ADMIN'
      });

    expect(res.status).toBe(403);
  });

  // --- FC Manager Upload Restriction Tests ---
  it('FC Manager is FORBIDDEN (403) from initiating Centralized multi-FC uploads', async () => {
    const res = await request(app)
      .post('/api/v1/uploads/initiate')
      .set('Cookie', delhiManagerCookie)
      .send({
        fileName: 'centralized_daily.csv',
        contentType: 'text/csv',
        fileSize: 1024,
        mode: 'CENTRALIZED'
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/FC Managers are restricted/);
  });

  it('FC Manager is FORBIDDEN (403) from initiating Single FC upload for an unassigned FC', async () => {
    const res = await request(app)
      .post('/api/v1/uploads/initiate')
      .set('Cookie', delhiManagerCookie)
      .send({
        fileName: 'blr_data.csv',
        contentType: 'text/csv',
        fileSize: 1024,
        mode: 'SINGLE_FC',
        fcId: blrFcId
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Forbidden/);
  });

  it('FC Manager CAN initiate Single FC upload for their assigned Delhi FC', async () => {
    const res = await request(app)
      .post('/api/v1/uploads/initiate')
      .set('Cookie', delhiManagerCookie)
      .send({
        fileName: 'delhi_data.csv',
        contentType: 'text/csv',
        fileSize: 1024,
        mode: 'SINGLE_FC',
        fcId: delhiFcId
      });

    expect(res.status).toBe(201);
    expect(res.body.batchId).toBeDefined();
    expect(res.body.uploadUrl).toBeDefined();
  });

  // --- Notifications API Tests ---
  it('Authenticated user can fetch notifications and unread counts', async () => {
    // Seed a test notification
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@prozo.com' } });
    const notification = await prisma.notification.create({
      data: {
        userId: adminUser!.id,
        title: '🚨 Test Anomaly Alert',
        message: 'High packaging cost detected for FC-DEL-01',
        type: 'ANOMALY_DETECTED',
        severity: 'HIGH'
      }
    });

    const countRes = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Cookie', adminCookie);

    expect(countRes.status).toBe(200);
    expect(countRes.body.count).toBeGreaterThan(0);

    const listRes = await request(app)
      .get('/api/v1/notifications')
      .set('Cookie', adminCookie);

    expect(listRes.status).toBe(200);
    expect(listRes.body.some((n: any) => n.id === notification.id)).toBe(true);

    const readRes = await request(app)
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set('Cookie', adminCookie);

    expect(readRes.status).toBe(200);
    expect(readRes.body.isRead).toBe(true);
  });
});
