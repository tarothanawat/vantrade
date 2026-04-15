import { apiClient } from './base';

export const heartbeatClient = {
  trigger: () => apiClient.post<{ triggered: boolean; triggeredAt: string }>('/heartbeat/trigger', {}),
};
