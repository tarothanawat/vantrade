import { AuthResponseSchema, type LoginDto, type RegisterDto } from '@vantrade/types';
import { apiClient } from './base';

export const authClient = {
  login: (dto: LoginDto) =>
    apiClient.post('/auth/login', dto, undefined, AuthResponseSchema),

  register: (dto: RegisterDto) =>
    apiClient.post('/auth/register', dto, undefined, AuthResponseSchema),
};
