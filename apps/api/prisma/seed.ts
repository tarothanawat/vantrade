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

  const seedBlueprints: Array<{
    id: string;
    title: string;
    description: string;
    parameters: {
      symbol: string;
      executionTimeframe: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day';
      executionMode: 'BUY_LOW_SELL_HIGH' | 'SELL_HIGH_BUY_LOW';
      rsiPeriod: number;
      rsiBuyThreshold: number;
      rsiSellThreshold: number;
      maPeriod: number;
      quantity: number;
    };
    isVerified: boolean;
  }> = [
    {
      id: 'seed-blueprint-001',
      title: 'RSI Mean Reversion — AAPL',
      description:
        'A classic mean-reversion strategy on AAPL using RSI(14). Buys when RSI drops below 30 (oversold) and sells when it rises above 70 (overbought).',
      parameters: {
        symbol: 'AAPL',
        executionTimeframe: '5Min',
        executionMode: 'BUY_LOW_SELL_HIGH',
        rsiPeriod: 14,
        rsiBuyThreshold: 30,
        rsiSellThreshold: 70,
        maPeriod: 50,
        quantity: 1,
      },
      isVerified: true,
    },
    {
      id: 'seed-blueprint-002',
      title: 'Crypto 24/7 Baseline — BTCUSD',
      description:
        'A continuous-market crypto strategy for BTCUSD using RSI(12) with balanced thresholds to validate overnight and weekend heartbeat execution.',
      parameters: {
        symbol: 'BTCUSD',
        executionTimeframe: '1Min',
        executionMode: 'BUY_LOW_SELL_HIGH',
        rsiPeriod: 12,
        rsiBuyThreshold: 32,
        rsiSellThreshold: 68,
        maPeriod: 34,
        quantity: 0.2,
      },
      isVerified: true,
    },
    {
      id: 'seed-blueprint-003',
      title: 'Momentum Reversion — ETHUSD',
      description:
        'An active ETHUSD profile with shorter RSI period and tighter spread to generate more frequent buy/sell events in 24/7 conditions.',
      parameters: {
        symbol: 'ETHUSD',
        executionTimeframe: '1Min',
        executionMode: 'SELL_HIGH_BUY_LOW',
        rsiPeriod: 9,
        rsiBuyThreshold: 38,
        rsiSellThreshold: 62,
        maPeriod: 21,
        quantity: 0.35,
      },
      isVerified: true,
    },
    {
      id: 'seed-blueprint-004',
      title: 'Conservative Swing — SPY',
      description:
        'A lower-frequency SPY strategy with wider thresholds and a longer MA filter designed for steadier test behavior.',
      parameters: {
        symbol: 'SPY',
        executionTimeframe: '15Min',
        executionMode: 'BUY_LOW_SELL_HIGH',
        rsiPeriod: 21,
        rsiBuyThreshold: 25,
        rsiSellThreshold: 75,
        maPeriod: 100,
        quantity: 1,
      },
      isVerified: true,
    },
  ];

  for (const blueprint of seedBlueprints) {
    await prisma.blueprint.upsert({
      where: { id: blueprint.id },
      update: {
        title: blueprint.title,
        description: blueprint.description,
        parameters: blueprint.parameters,
        isVerified: blueprint.isVerified,
      },
      create: {
        ...blueprint,
        authorId: provider.id,
      },
    });
  }

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
