import {
    AuthMeResponseSchema,
    AuthResponseSchema,
    type LoginDto,
    type RegisterDto,
} from '@vantrade/types';
import { z } from 'zod';
import { apiClient } from './base';

const LogoutResponseSchema = z.object({ message: z.string() });

export const authClient = {
  login: (dto: LoginDto) =>
    apiClient.post('/auth/login', dto, undefined, AuthResponseSchema),

  register: (dto: RegisterDto) =>
    apiClient.post('/auth/register', dto, undefined, AuthResponseSchema),

  me: () =>
    apiClient.get('/auth/me', undefined, AuthMeResponseSchema),

  logout: () =>
    apiClient.post('/auth/logout', {}, undefined, LogoutResponseSchema),
};
