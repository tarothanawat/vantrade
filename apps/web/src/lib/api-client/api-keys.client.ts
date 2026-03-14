import {
  ApiKeyMutationResponseSchema,
  ApiKeyStatusResponseSchema,
  type ApiKeyCreateDto,
} from '@vantrade/types';
import { apiClient } from './base';

export const apiKeysClient = {
  hasKey: (token: string) => apiClient.get('/api-keys/status', token, ApiKeyStatusResponseSchema),

  upsert: (dto: ApiKeyCreateDto, token: string) =>
    apiClient.post('/api-keys', dto, token, ApiKeyMutationResponseSchema),

  remove: (token: string) => apiClient.delete('/api-keys', token, ApiKeyMutationResponseSchema),
};
