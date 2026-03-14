import type { Blueprint, BlueprintCreateDto, BlueprintUpdateDto } from '@vantrade/types';
import { apiClient } from './base';

export const blueprintsClient = {
  getAll: () =>
    apiClient.get<Blueprint[]>('/blueprints'),

  getById: (id: string) =>
    apiClient.get<Blueprint>(`/blueprints/${id}`),

  getMine: (token: string) =>
    apiClient.get<Blueprint[]>('/blueprints/my/list', token),

  create: (dto: BlueprintCreateDto, token: string) =>
    apiClient.post<Blueprint>('/blueprints', dto, token),

  update: (id: string, dto: BlueprintUpdateDto, token: string) =>
    apiClient.patch<Blueprint>(`/blueprints/${id}`, dto, token),

  remove: (id: string, token: string) =>
    apiClient.delete<void>(`/blueprints/${id}`, token),

  verify: (id: string, isVerified: boolean, token: string) =>
    apiClient.patch<Blueprint>(`/blueprints/${id}/verify`, { isVerified }, token),
};
