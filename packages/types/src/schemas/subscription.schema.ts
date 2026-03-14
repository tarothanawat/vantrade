import { z } from 'zod';

export const SubscriptionCreateSchema = z.object({
  blueprintId: z.string().cuid(),
});

export const SubscriptionToggleSchema = z.object({
  isActive: z.boolean(),
});

export type SubscriptionCreateDto = z.infer<typeof SubscriptionCreateSchema>;
export type SubscriptionToggleDto = z.infer<typeof SubscriptionToggleSchema>;
