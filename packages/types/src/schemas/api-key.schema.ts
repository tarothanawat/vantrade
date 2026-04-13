import { z } from 'zod';

export const ApiKeyCreateSchema = z.object({
  alpacaApiKey: z.string().min(10),
  alpacaApiSecret: z.string().min(10),
  label: z.string().min(1).max(50).default('default'),
});

export const ApiKeyDeleteSchema = z.object({
  label: z.string().min(1).max(50).default('default'),
});

export const ApiKeyStatusResponseSchema = z.boolean();

export const ApiKeyMutationResponseSchema = z.object({
  message: z.string().min(1),
});

export const ApiKeyListResponseSchema = z.array(
  z.object({
    label: z.string(),
    broker: z.string(),
  }),
);

export type ApiKeyCreateDto = z.infer<typeof ApiKeyCreateSchema>;
export type ApiKeyDeleteDto = z.infer<typeof ApiKeyDeleteSchema>;
export type ApiKeyStatusResponseDto = z.infer<typeof ApiKeyStatusResponseSchema>;
export type ApiKeyMutationResponseDto = z.infer<typeof ApiKeyMutationResponseSchema>;
export type ApiKeyListResponseDto = z.infer<typeof ApiKeyListResponseSchema>;
