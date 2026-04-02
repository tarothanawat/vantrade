import { z } from 'zod';
import { BlueprintResponseSchema } from './blueprint.schema';
import { TradeLogSchema } from './trade-log.schema';

export const SubscriptionCreateSchema = z.object({
  blueprintId: z.string().min(1),
});

export const SubscriptionToggleSchema = z.object({
  isActive: z.boolean(),
});

export const SubscriptionResponseSchema = z.object({
  id: z.string().min(1),
  isActive: z.boolean(),
  createdAt: z.coerce.date(),
  userId: z.string().min(1),
  blueprintId: z.string().min(1),
  blueprint: BlueprintResponseSchema.optional(),
  tradeLogs: z.array(TradeLogSchema).optional(),
});

export const SubscriptionListResponseSchema = z.array(SubscriptionResponseSchema);

export type SubscriptionCreateDto = z.infer<typeof SubscriptionCreateSchema>;
export type SubscriptionToggleDto = z.infer<typeof SubscriptionToggleSchema>;
export type SubscriptionResponseDto = z.infer<typeof SubscriptionResponseSchema>;
export type SubscriptionListResponseDto = z.infer<typeof SubscriptionListResponseSchema>;
