import {
  BlueprintListResponseSchema,
  BlueprintResponseSchema,
  type BlueprintCreateDto,
  type BlueprintUpdateDto,
} from '@vantrade/types';
import { apiClient } from './base';

export const blueprintsClient = {
  getAll: () =>
    apiClient.get('/blueprints', undefined, BlueprintListResponseSchema),

  getAllAdmin: (token: string) =>
    apiClient.get('/blueprints/admin/all', token, BlueprintListResponseSchema),

  getById: (id: string) =>
    apiClient.get(`/blueprints/${id}`, undefined, BlueprintResponseSchema),

  getMine: (token: string) =>
    apiClient.get('/blueprints/my/list', token, BlueprintListResponseSchema),

  create: (dto: BlueprintCreateDto, token: string) =>
    apiClient.post('/blueprints', dto, token, BlueprintResponseSchema),

  update: (id: string, dto: BlueprintUpdateDto, token: string) =>
    apiClient.patch(`/blueprints/${id}`, dto, token, BlueprintResponseSchema),

  remove: (id: string, token: string) =>
    apiClient.delete<void>(`/blueprints/${id}`, token),

  verify: (id: string, isVerified: boolean, token: string) =>
    apiClient.patch(`/blueprints/${id}/verify`, { isVerified }, token, BlueprintResponseSchema),
};
