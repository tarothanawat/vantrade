import type { Subscription, SubscriptionCreateDto } from '@vantrade/types';
import { apiClient } from './base';

export const subscriptionsClient = {
  getMine: (token: string) =>
    apiClient.get<Subscription[]>('/subscriptions', token),

  create: (dto: SubscriptionCreateDto, token: string) =>
    apiClient.post<Subscription>('/subscriptions', dto, token),

  toggle: (id: string, isActive: boolean, token: string) =>
    apiClient.patch<Subscription>(`/subscriptions/${id}/toggle`, { isActive }, token),

  remove: (id: string, token: string) =>
    apiClient.delete<void>(`/subscriptions/${id}`, token),
};
