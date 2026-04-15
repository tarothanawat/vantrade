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
    {
      id: 'seed-blueprint-TEST',
      title: '[TEST] Fast Alternating RSI — BTCUSD',
      description:
        '[TESTING ONLY] RSI(2) with tight thresholds (buy<45 / sell>55) on BTCUSD 1Min. A 2-period RSI swings dramatically each bar: one up bar pushes RSI above 55, one down bar drops it below 45. Triggers a BUY then a SELL on consecutive heartbeat ticks, proving the full entry → exit round-trip works end-to-end.',
      parameters: {
        symbol: 'BTCUSD',
        executionTimeframe: '1Min',
        executionMode: 'BUY_LOW_SELL_HIGH',
        rsiPeriod: 2,
        rsiBuyThreshold: 50,
        rsiSellThreshold: 50,
        maPeriod: 2,
        quantity: 1,
      },
      isVerified: true,
    },
    {
      id: 'seed-blueprint-TEST-SELL',
      title: '[TEST] Always-Fire SELL — AAPL',
      description:
        '[TESTING ONLY] SELL_HIGH_BUY_LOW mode starts expecting a SELL on the very first trigger. RSI sell threshold set to 0 so signal is always SELL. Uses AAPL (equity — paper short-selling supported). Requires NYSE market hours (09:30–16:00 ET Mon–Fri). Trigger POST /api/heartbeat/trigger to verify the SELL execution path. Note: crypto cannot be shorted on Alpaca paper accounts.',
      parameters: {
        symbol: 'AAPL',
        executionTimeframe: '1Min',
        executionMode: 'SELL_HIGH_BUY_LOW',
        rsiPeriod: 2,
        rsiBuyThreshold: 0,
        rsiSellThreshold: 0,
        maPeriod: 2,
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

  // Seed test subscriptions for tester@vantrade.io
  const tester = await prisma.user.findUnique({ where: { email: 'tester@vantrade.io' } });
  if (tester) {
    for (const blueprintId of ['seed-blueprint-TEST', 'seed-blueprint-TEST-SELL']) {
      await prisma.subscription.upsert({
        where: { userId_blueprintId: { userId: tester.id, blueprintId } },
        update: {},
        create: { userId: tester.id, blueprintId, isActive: true },
      });
    }
  }

  console.log('Seeding complete.');
  console.log(`  Admin:    admin@vantrade.io / Admin1234!`);
  console.log(`  Provider: provider@vantrade.io / Provider1234!`);
  console.log(`  Tester:   tester@vantrade.io / Tester1234!`);
  console.log(`  Subscriptions seeded for tester: [TEST] Always-Fire BUY + SELL`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
