import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

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
