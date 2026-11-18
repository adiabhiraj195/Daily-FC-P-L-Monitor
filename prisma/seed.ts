import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Prozo FC Margin Monitor Database Seed ---');

  // 1. Seed Users
  const passwordHash = await bcrypt.hash('Password@123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@prozo.com' },
    update: {},
    create: {
      name: 'System Administrator',
      email: 'admin@prozo.com',
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true
    }
  });

  const financeUser = await prisma.user.upsert({
    where: { email: 'finance@prozo.com' },
    update: {},
    create: {
      name: 'Central Finance Controller',
      email: 'finance@prozo.com',
      passwordHash,
      role: UserRole.FINANCE,
      isActive: true
    }
  });

  const managerDelhi = await prisma.user.upsert({
    where: { email: 'manager.delhi@prozo.com' },
    update: {},
    create: {
      name: 'Rohan Sharma (Delhi FC)',
      email: 'manager.delhi@prozo.com',
      passwordHash,
      role: UserRole.FC_MANAGER,
      isActive: true
    }
  });

  const managerBlr = await prisma.user.upsert({
    where: { email: 'manager.blr@prozo.com' },
    update: {},
    create: {
      name: 'Priya Nair (Bangalore FC)',
      email: 'manager.blr@prozo.com',
      passwordHash,
      role: UserRole.FC_MANAGER,
      isActive: true
    }
  });

  console.log('Seeded Users: Admin, Finance, 2 FC Managers');

  // 2. Seed Fulfilment Centres
  const fcsData = [
    { code: 'FC-DEL-01', name: 'Delhi Fulfilment Centre', location: 'Gurugram' },
    { code: 'FC-BLR-01', name: 'Bangalore Fulfilment Centre', location: 'Hosur Road' },
    { code: 'FC-MUM-01', name: 'Mumbai Fulfilment Centre', location: 'Bhiwandi' },
    { code: 'FC-HYD-01', name: 'Hyderabad Fulfilment Centre', location: 'Shamshabad' },
    { code: 'FC-KOL-01', name: 'Kolkata Fulfilment Centre', location: 'Dankuni' },
    { code: 'FC-REW-01', name: 'Rewari Fulfilment Centre', location: 'Rewari' }
  ];

  const fcs = [];
  for (const fc of fcsData) {
    const created = await prisma.fulfilmentCentre.upsert({
      where: { code: fc.code },
      update: {},
      create: {
        code: fc.code,
        name: fc.name,
        location: fc.location,
        currency: 'INR',
        isActive: true
      }
    });
    fcs.push(created);
  }
  console.log(`Seeded ${fcs.length} Fulfilment Centres`);

  // 3. Assign Managers to FCs
  await prisma.userFulfilmentCentre.upsert({
    where: {
      userId_fcId: {
        userId: managerDelhi.id,
        fcId: fcs[0]!.id
      }
    },
    update: {},
    create: {
      userId: managerDelhi.id,
      fcId: fcs[0]!.id
    }
  });

  await prisma.userFulfilmentCentre.upsert({
    where: {
      userId_fcId: {
        userId: managerBlr.id,
        fcId: fcs[1]!.id
      }
    },
    update: {},
    create: {
      userId: managerBlr.id,
      fcId: fcs[1]!.id
    }
  });
  console.log('Assigned FC Managers to Delhi and Bangalore FCs');

  // 4. Seed Target Rules (Illustrative defaults because Case Study 3.xlsx was absent)
  // Target ranges clearly labelled illustrative per spec
  const illustrativeTargets = [
    { metricKey: 'MANPOWER', minPct: '15.0000', maxPct: '20.0000' },
    { metricKey: 'PACKAGING', minPct: '8.0000', maxPct: '12.0000' },
    { metricKey: 'POWER_AND_FUEL', minPct: '3.0000', maxPct: '6.0000' },
    { metricKey: 'FC_RENT', minPct: '10.0000', maxPct: '15.0000' },
    { metricKey: 'EQUIPMENT_RENTALS', minPct: '2.0000', maxPct: '5.0000' },
    { metricKey: 'OVERHEADS', minPct: '3.0000', maxPct: '7.0000' }
  ];

  for (const target of illustrativeTargets) {
    const existing = await prisma.targetRule.findFirst({
      where: {
        fcId: null,
        metricKey: target.metricKey
      }
    });

    if (!existing) {
      await prisma.targetRule.create({
        data: {
          fcId: null, // Global rule
          metricKey: target.metricKey,
          minPct: target.minPct,
          maxPct: target.maxPct,
          effectiveFrom: new Date('2026-01-01'),
          createdById: admin.id
        }
      });
    }
  }
  console.log('Seeded Global Target Rules (labelled illustrative)');

  console.log('--- Database Seed Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
