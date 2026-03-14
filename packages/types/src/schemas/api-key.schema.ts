import { z } from 'zod';

export const ApiKeyCreateSchema = z.object({
  alpacaApiKey: z.string().min(10),
  alpacaApiSecret: z.string().min(10),
});

export type ApiKeyCreateDto = z.infer<typeof ApiKeyCreateSchema>;
