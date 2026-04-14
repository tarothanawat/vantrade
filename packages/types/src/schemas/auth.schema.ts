import { z } from 'zod';
import { Role } from '../enums';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const UserListItemSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.nativeEnum(Role),
});
export const UserListResponseSchema = z.array(UserListItemSchema);
export const AssignRoleSchema = z.object({
  role: z.nativeEnum(Role),
});
export type UserListItemDto = z.infer<typeof UserListItemSchema>;
export type AssignRoleDto = z.infer<typeof AssignRoleSchema>;

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    role: z.nativeEnum(Role),
  }),
});

export const AuthMeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    role: z.nativeEnum(Role),
  }),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type AuthResponseDto = z.infer<typeof AuthResponseSchema>;
export type AuthMeResponseDto = z.infer<typeof AuthMeResponseSchema>;
