import { z } from 'zod';

export const TradeLogSchema = z.object({
  id: z.string().min(1),
  symbol: z.string(),
  side: z.enum(['buy', 'sell', 'hold']),
  quantity: z.number().nonnegative(),
  price: z.number().nonnegative(),
  pnl: z.number().nullable(),
  status: z.string(),
  executedAt: z.coerce.date(),
  subscriptionId: z.string().min(1),
});

export const TradeLogListResponseSchema = z.array(TradeLogSchema);

export type TradeLogDto = z.infer<typeof TradeLogSchema>;
export type TradeLogListResponseDto = z.infer<typeof TradeLogListResponseSchema>;
