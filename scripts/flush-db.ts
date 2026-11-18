import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as readline from 'node:readline';

const prisma = new PrismaClient();

async function confirmPrompt(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === 'y' || trimmed === 'yes');
    });
  });
}

async function flushDatabase() {
  const isForced =
    process.argv.includes('--force') ||
    process.argv.includes('-f') ||
    process.argv.includes('--yes') ||
    process.argv.includes('-y') ||
    process.env['FORCE_FLUSH'] === 'true';

  console.log('=====================================================');
  console.log('           Database Flush Tool (Preserve Users)       ');
  console.log('=====================================================\n');

  try {
    // 1. Verify User table and record current user count
    const userCountBefore = await prisma.user.count();
    console.log(`👤 Preserved Table: "User" (${userCountBefore} users currently in DB)`);

    // 2. Discover all tables in the public schema except User and migrations
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND LOWER(tablename) NOT IN ('user', 'users', '_prisma_migrations')
      ORDER BY tablename ASC;
    `;

    if (tables.length === 0) {
      console.log('\n✨ No non-user tables found to flush in the database.');
      return;
    }

    console.log(`\n📋 Found ${tables.length} table(s) scheduled for flush:`);
    for (const table of tables) {
      try {
        const countRes = await prisma.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(
          `SELECT COUNT(*) as count FROM "${table.tablename}";`
        );
        const rowCount = countRes[0]?.count?.toString() ?? '0';
        console.log(`   - "${table.tablename}" (${rowCount} rows)`);
      } catch {
        console.log(`   - "${table.tablename}"`);
      }
    }

    // 3. Confirm with user if running interactively
    if (!isForced && process.stdin.isTTY) {
      console.log('\n⚠️  WARNING: This will permanently delete ALL data from the tables listed above.');
      console.log('   The "User" table will remain completely untouched.');
      const confirmed = await confirmPrompt('\nAre you sure you want to proceed? [y/N]: ');
      if (!confirmed) {
        console.log('\n🚫 Flush aborted by user. Database was not modified.');
        return;
      }
    }

    // 4. Execute TRUNCATE CASCADE on all target tables
    console.log('\n🔄 Truncating tables...');
    const quotedTableList = tables.map((t) => `"${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE ${quotedTableList} RESTART IDENTITY CASCADE;`
    );

    // 5. Verify integrity of User table
    const userCountAfter = await prisma.user.count();
    console.log('\n=====================================================');
    if (userCountAfter !== userCountBefore) {
      console.error(
        `❌ CRITICAL INTEGRITY CHECK FAILED: User count changed from ${userCountBefore} to ${userCountAfter}!`
      );
      process.exitCode = 1;
    } else {
      console.log(`✅ Flush completed successfully!`);
      console.log(`✅ ${tables.length} table(s) wiped clean.`);
      console.log(`✅ "User" table intact with ${userCountAfter} user(s).`);
    }
    console.log('=====================================================\n');
  } catch (error) {
    console.error('\n❌ Error executing database flush:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

flushDatabase();
