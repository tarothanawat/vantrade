import { TradeLogListResponseSchema } from '@vantrade/types';
import { apiClient } from './base';

export const tradeLogsClient = {
  getBySubscription: (subscriptionId: string) =>
    apiClient.get(`/subscriptions/${subscriptionId}/trade-logs`, undefined, TradeLogListResponseSchema),
};
