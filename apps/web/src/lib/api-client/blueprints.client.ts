import {
  BacktestResultSchema,
  BlueprintListResponseSchema,
  BlueprintResponseSchema,
  type BacktestQueryDto,
  type BacktestResultDto,
  type BlueprintBacktestPreviewDto,
  type BlueprintCreateDto,
  type BlueprintListResponseDto,
  type BlueprintResponseDto,
  type BlueprintUpdateDto,
} from '@vantrade/types';
import { apiClient } from './base';

function toQueryString(obj: Partial<Record<string, string | number | undefined>>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}

export const blueprintsClient = {
  getAll: () =>
    apiClient.get<BlueprintListResponseDto>('/blueprints', undefined, BlueprintListResponseSchema),

  getAllAdmin: () =>
    apiClient.get<BlueprintListResponseDto>('/blueprints/admin/all', undefined, BlueprintListResponseSchema),

  getById: (id: string) =>
    apiClient.get<BlueprintResponseDto>(`/blueprints/${id}`, undefined, BlueprintResponseSchema),

  getMine: () =>
    apiClient.get<BlueprintListResponseDto>('/blueprints/my/list', undefined, BlueprintListResponseSchema),

  create: (dto: BlueprintCreateDto) =>
    apiClient.post<BlueprintResponseDto>('/blueprints', dto, undefined, BlueprintResponseSchema),

  update: (id: string, dto: BlueprintUpdateDto) =>
    apiClient.patch<BlueprintResponseDto>(`/blueprints/${id}`, dto, undefined, BlueprintResponseSchema),

  remove: (id: string) =>
    apiClient.delete<void>(`/blueprints/${id}`),

  verify: (id: string, isVerified: boolean) =>
    apiClient.patch<BlueprintResponseDto>(`/blueprints/${id}/verify`, { isVerified }, undefined, BlueprintResponseSchema),

  runBacktest: (id: string, query: Partial<BacktestQueryDto>) =>
    apiClient.get<BacktestResultDto>(`/blueprints/${id}/backtest?${toQueryString(query)}`, undefined, BacktestResultSchema),

  previewBacktest: (dto: BlueprintBacktestPreviewDto) =>
    apiClient.post<BacktestResultDto>('/blueprints/backtest', dto, undefined, BacktestResultSchema),
};
