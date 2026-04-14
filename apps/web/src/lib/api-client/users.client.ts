import { UserListItemSchema, UserListResponseSchema } from '@vantrade/types';
import type { Role } from '@vantrade/types';
import { apiClient } from './base';

export const usersClient = {
  listUsers: () => apiClient.get('/auth/users', undefined, UserListResponseSchema),

  assignRole: (id: string, role: Role) =>
    apiClient.patch(`/auth/users/${id}/role`, { role }, undefined, UserListItemSchema),
};
