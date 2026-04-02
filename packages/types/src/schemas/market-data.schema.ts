import { z } from 'zod';

export const MarketDataTimeframeSchema = z.enum(['1Min', '5Min', '15Min', '1Hour', '1Day']);

export const MarketDataBarsQuerySchema = z.object({
  symbol: z.string().min(2).max(20).transform((value) => value.trim().toUpperCase()),
  timeframe: MarketDataTimeframeSchema.default('1Min'),
  limit: z.coerce.number().int().min(10).max(500).default(120),
});

export const MarketBarSchema = z.object({
  symbol: z.string().min(1),
  timestamp: z.coerce.date(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().nonnegative(),
});

export const MarketBarListResponseSchema = z.array(MarketBarSchema);

export type MarketDataTimeframe = z.infer<typeof MarketDataTimeframeSchema>;
export type MarketDataBarsQueryDto = z.infer<typeof MarketDataBarsQuerySchema>;
export type MarketBarDto = z.infer<typeof MarketBarSchema>;
export type MarketBarListResponseDto = z.infer<typeof MarketBarListResponseSchema>;
