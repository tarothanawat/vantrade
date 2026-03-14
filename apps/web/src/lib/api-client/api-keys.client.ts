import {
  ApiKeyMutationResponseSchema,
  ApiKeyStatusResponseSchema,
  type ApiKeyCreateDto,
} from '@vantrade/types';
import { apiClient } from './base';

export const apiKeysClient = {
  hasKey: () => apiClient.get('/api-keys/status', undefined, ApiKeyStatusResponseSchema),

  upsert: (dto: ApiKeyCreateDto) =>
    apiClient.post('/api-keys', dto, undefined, ApiKeyMutationResponseSchema),

  remove: () => apiClient.delete('/api-keys', undefined, ApiKeyMutationResponseSchema),
};
