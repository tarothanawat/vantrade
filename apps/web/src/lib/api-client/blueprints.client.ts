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

  getAllAdmin: () =>
    apiClient.get('/blueprints/admin/all', undefined, BlueprintListResponseSchema),

  getById: (id: string) =>
    apiClient.get(`/blueprints/${id}`, undefined, BlueprintResponseSchema),

  getMine: () =>
    apiClient.get('/blueprints/my/list', undefined, BlueprintListResponseSchema),

  create: (dto: BlueprintCreateDto) =>
    apiClient.post('/blueprints', dto, undefined, BlueprintResponseSchema),

  update: (id: string, dto: BlueprintUpdateDto) =>
    apiClient.patch(`/blueprints/${id}`, dto, undefined, BlueprintResponseSchema),

  remove: (id: string) =>
    apiClient.delete<void>(`/blueprints/${id}`),

  verify: (id: string, isVerified: boolean) =>
    apiClient.patch(`/blueprints/${id}/verify`, { isVerified }, undefined, BlueprintResponseSchema),
};
