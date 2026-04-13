import { z } from 'zod';
import { MarketDataTimeframeSchema } from './market-data.schema';

export const BlueprintExecutionModeSchema = z.enum([
  'BUY_LOW_SELL_HIGH',
  'SELL_HIGH_BUY_LOW',
]);

// ── RSI Strategy Parameters ──────────────────────────────────────────────────
// strategyType defaults to 'RSI' so existing DB records without the field
// still parse successfully — zero DB migration needed.
export const RsiParametersSchema = z.object({
  strategyType: z.literal('RSI').default('RSI'),
  symbol: z.string().min(1).max(10).toUpperCase(),
  executionTimeframe: MarketDataTimeframeSchema.default('1Min'),
  executionMode: BlueprintExecutionModeSchema.default('BUY_LOW_SELL_HIGH'),
  rsiPeriod: z.number().int().min(2).max(100),
  rsiBuyThreshold: z.number().min(0).max(100),
  rsiSellThreshold: z.number().min(0).max(100),
  maPeriod: z.number().int().min(2).max(200),
  quantity: z.number().positive(),
});

// ── ICT / Smart Money Concepts Strategy Parameters ───────────────────────────
export const IctSessionSchema = z.enum(['LONDON', 'NEW_YORK', 'OVERLAP', 'ALL']);

export const IctParametersSchema = z.object({
  strategyType: z.literal('ICT'),
  symbol: z.string().min(1).max(10).toUpperCase(),
  quantity: z.number().positive(),

  // Timeframe roles
  biasTimeframe: MarketDataTimeframeSchema.default('1Hour'),
  confirmTimeframe: MarketDataTimeframeSchema.default('15Min'),
  entryTimeframe: MarketDataTimeframeSchema.default('5Min'),

  // Structure detection
  swingLookback: z.number().int().min(3).max(20).default(5),

  // Entry zone types
  useOrderBlocks: z.boolean().default(true),
  useFairValueGaps: z.boolean().default(true),
  fvgMinGapPct: z.number().min(0).max(5).default(0.1), // % of price

  // Risk management (slPoints = price units, e.g. $10 on XAUUSD)
  slPoints: z.number().positive().default(10),
  minRR: z.number().min(1).default(3),
  maxTradesPerSession: z.number().int().min(1).max(20).default(1),
  maxLossesPerSession: z.number().int().min(1).max(10).default(1),

  // Session filter
  sessionFilter: IctSessionSchema.default('ALL'),
  sessionTimezone: z.string().default('America/New_York'), // IANA tz string

  // Optional confirmation
  requireLiquiditySweep: z.boolean().default(false),
});

// ── Combined discriminated union ─────────────────────────────────────────────
// z.preprocess injects strategyType:'RSI' for legacy DB records that lack the
// field — this runs before the discriminant is read, so existing data parses
// without any DB migration.
export const BlueprintParametersSchema = z.preprocess(
  (input) => {
    if (typeof input === 'object' && input !== null && !('strategyType' in input)) {
      return { ...(input as object), strategyType: 'RSI' };
    }
    return input;
  },
  z.discriminatedUnion('strategyType', [RsiParametersSchema, IctParametersSchema]),
);

export const BlueprintCreateSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(1000),
  parameters: BlueprintParametersSchema,
});

export const BlueprintUpdateSchema = BlueprintCreateSchema.partial();

export const BlueprintVerifySchema = z.object({
  isVerified: z.boolean(),
});

export const BlueprintResponseSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string(),
  parameters: BlueprintParametersSchema,
  isVerified: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  authorId: z.string().min(1),
  author: z
    .object({
      id: z.string().min(1),
      email: z.string().email(),
    })
    .optional(),
});

export const BlueprintListResponseSchema = z.array(BlueprintResponseSchema);

export type RsiParametersDto = z.infer<typeof RsiParametersSchema>;
export type IctParametersDto = z.infer<typeof IctParametersSchema>;
export type IctSessionDto = z.infer<typeof IctSessionSchema>;
export type BlueprintCreateDto = z.infer<typeof BlueprintCreateSchema>;
export type BlueprintUpdateDto = z.infer<typeof BlueprintUpdateSchema>;
export type BlueprintVerifyDto = z.infer<typeof BlueprintVerifySchema>;
export type BlueprintParametersDto = z.infer<typeof BlueprintParametersSchema>;
export type BlueprintResponseDto = z.infer<typeof BlueprintResponseSchema>;
export type BlueprintListResponseDto = z.infer<typeof BlueprintListResponseSchema>;
