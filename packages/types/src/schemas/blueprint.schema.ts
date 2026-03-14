import { z } from 'zod';

export const BlueprintParametersSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  rsiPeriod: z.number().int().min(2).max(100),
  rsiBuyThreshold: z.number().min(0).max(100),
  rsiSellThreshold: z.number().min(0).max(100),
  maPeriod: z.number().int().min(2).max(200),
  quantity: z.number().positive(),
});

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

export type BlueprintCreateDto = z.infer<typeof BlueprintCreateSchema>;
export type BlueprintUpdateDto = z.infer<typeof BlueprintUpdateSchema>;
export type BlueprintVerifyDto = z.infer<typeof BlueprintVerifySchema>;
export type BlueprintParametersDto = z.infer<typeof BlueprintParametersSchema>;
export type BlueprintResponseDto = z.infer<typeof BlueprintResponseSchema>;
export type BlueprintListResponseDto = z.infer<typeof BlueprintListResponseSchema>;
