import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create admin user
  const adminHash = await bcrypt.hash('Admin1234!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@vantrade.io' },
    update: {},
    create: {
      email: 'admin@vantrade.io',
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
  });

  // Create provider user
  const providerHash = await bcrypt.hash('Provider1234!', 12);
  const provider = await prisma.user.upsert({
    where: { email: 'provider@vantrade.io' },
    update: {},
    create: {
      email: 'provider@vantrade.io',
      passwordHash: providerHash,
      role: Role.PROVIDER,
    },
  });

  // Create tester user
  const testerHash = await bcrypt.hash('Tester1234!', 12);
  await prisma.user.upsert({
    where: { email: 'tester@vantrade.io' },
    update: {},
    create: {
      email: 'tester@vantrade.io',
      passwordHash: testerHash,
      role: Role.TESTER,
    },
  });

  // Create a sample Blueprint
  await prisma.blueprint.upsert({
    where: { id: 'seed-blueprint-001' },
    update: {},
    create: {
      id: 'seed-blueprint-001',
      title: 'RSI Mean Reversion — AAPL',
      description:
        'A classic mean-reversion strategy on AAPL using RSI(14). Buys when RSI drops below 30 (oversold) and sells when it rises above 70 (overbought).',
      parameters: {
        symbol: 'AAPL',
        rsiPeriod: 14,
        rsiBuyThreshold: 30,
        rsiSellThreshold: 70,
        maPeriod: 50,
        quantity: 1,
      },
      isVerified: true,
      authorId: provider.id,
    },
  });

  console.log('Seeding complete.');
  console.log(`  Admin:    admin@vantrade.io / Admin1234!`);
  console.log(`  Provider: provider@vantrade.io / Provider1234!`);
  console.log(`  Tester:   tester@vantrade.io / Tester1234!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
