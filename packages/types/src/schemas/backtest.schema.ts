import { z } from 'zod';
import { BlueprintParametersSchema } from './blueprint.schema';
import { MarketDataTimeframeSchema } from './market-data.schema';

export const BacktestQuerySchema = z.object({
  symbol: z.string().min(1).max(10).transform((v) => v.toUpperCase()).optional(),
  timeframe: MarketDataTimeframeSchema.optional(),
  limit: z.coerce.number().int().min(10).max(5000).default(200),
});

export const BacktestTradeSchema = z.object({
  entryTime: z.string(),
  exitTime: z.string().nullable(),
  side: z.enum(['buy', 'sell']),
  entryPrice: z.number(),
  exitPrice: z.number().nullable(),
  entryRsi: z.number(),
  exitRsi: z.number().nullable(),
  pnl: z.number().nullable(),
  isOpen: z.boolean(),
});

export const BacktestResultSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  barsAnalyzed: z.number().int(),
  trades: z.array(BacktestTradeSchema),
  totalPnL: z.number(),
  winRate: z.number(),
  totalTrades: z.number().int(),
  winCount: z.number().int(),
  lossCount: z.number().int(),
  equityCurve: z.array(z.object({ timestamp: z.string(), equity: z.number() })),
});

// Parameter-based backtest (no blueprint ID needed — used during blueprint creation)
export const BlueprintBacktestPreviewSchema = z.object({
  parameters: BlueprintParametersSchema,
  testSymbol: z.string().min(1).max(10).transform((v) => v.toUpperCase()).optional(),
  testTimeframe: MarketDataTimeframeSchema.optional(),
  limit: z.coerce.number().int().min(10).max(5000).default(200),
});

export type BacktestQueryDto = z.infer<typeof BacktestQuerySchema>;
export type BacktestTradeDto = z.infer<typeof BacktestTradeSchema>;
export type BacktestResultDto = z.infer<typeof BacktestResultSchema>;
export type BlueprintBacktestPreviewDto = z.infer<typeof BlueprintBacktestPreviewSchema>;
