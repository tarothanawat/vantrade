import { z } from 'zod';

export const TradeLogSchema = z.object({
  id: z.string().cuid(),
  symbol: z.string(),
  side: z.enum(['buy', 'sell']),
  quantity: z.number().positive(),
  price: z.number().positive(),
  pnl: z.number().nullable(),
  status: z.string(),
  executedAt: z.coerce.date(),
  subscriptionId: z.string().cuid(),
});

export type TradeLogDto = z.infer<typeof TradeLogSchema>;
