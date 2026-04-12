import {
  SubscriptionListResponseSchema,
  SubscriptionResponseSchema,
  SubscriptionStatsResponseSchema,
  type SubscriptionCreateDto,
} from '@vantrade/types';
import { apiClient } from './base';

export const subscriptionsClient = {
  getMine: () =>
    apiClient.get('/subscriptions', undefined, SubscriptionListResponseSchema),

  create: (dto: SubscriptionCreateDto) =>
    apiClient.post('/subscriptions', dto, undefined, SubscriptionResponseSchema),

  toggle: (id: string, isActive: boolean) =>
    apiClient.patch(`/subscriptions/${id}/toggle`, { isActive }, undefined, SubscriptionResponseSchema),

  remove: (id: string) =>
    apiClient.delete<void>(`/subscriptions/${id}`),

  getStats: (id: string) =>
    apiClient.get(`/subscriptions/${id}/stats`, undefined, SubscriptionStatsResponseSchema),
};
