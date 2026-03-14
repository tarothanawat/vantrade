import {
    SubscriptionListResponseSchema,
    SubscriptionResponseSchema,
    type SubscriptionCreateDto,
} from '@vantrade/types';
import { apiClient } from './base';

export const subscriptionsClient = {
  getMine: (token: string) =>
    apiClient.get('/subscriptions', token, SubscriptionListResponseSchema),

  create: (dto: SubscriptionCreateDto, token: string) =>
    apiClient.post('/subscriptions', dto, token, SubscriptionResponseSchema),

  toggle: (id: string, isActive: boolean, token: string) =>
    apiClient.patch(`/subscriptions/${id}/toggle`, { isActive }, token, SubscriptionResponseSchema),

  remove: (id: string, token: string) =>
    apiClient.delete<void>(`/subscriptions/${id}`, token),
};
