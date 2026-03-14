import type { AuthResponseDto, LoginDto, RegisterDto } from '@vantrade/types';
import { apiClient } from './base';

export const authClient = {
  login: (dto: LoginDto) =>
    apiClient.post<AuthResponseDto>('/auth/login', dto),

  register: (dto: RegisterDto) =>
    apiClient.post<AuthResponseDto>('/auth/register', dto),
};
