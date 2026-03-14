import { z } from 'zod';

export const ApiKeyCreateSchema = z.object({
  alpacaApiKey: z.string().min(10),
  alpacaApiSecret: z.string().min(10),
});

export const ApiKeyStatusResponseSchema = z.boolean();

export const ApiKeyMutationResponseSchema = z.object({
  message: z.string().min(1),
});

export type ApiKeyCreateDto = z.infer<typeof ApiKeyCreateSchema>;
export type ApiKeyStatusResponseDto = z.infer<typeof ApiKeyStatusResponseSchema>;
export type ApiKeyMutationResponseDto = z.infer<typeof ApiKeyMutationResponseSchema>;
