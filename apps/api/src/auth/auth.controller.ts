import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
    Res,
    UsePipes,
} from '@nestjs/common';
import type { LoginDto, RegisterDto } from '@vantrade/types';
import { LoginSchema, RegisterSchema } from '@vantrade/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';

const AUTH_COOKIE_NAME = 'vantrade_auth';

type CookieResponse = {
  cookie: (name: string, value: string, options: Record<string, unknown>) => void;
  clearCookie: (name: string, options: Record<string, unknown>) => void;
};

function setAuthCookie(res: CookieResponse, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

function clearAuthCookie(res: CookieResponse): void {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: CookieResponse) {
    const result = await this.authService.register(dto);
    setAuthCookie(res, result.accessToken);
    return result;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(LoginSchema))
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: CookieResponse) {
    const result = await this.authService.login(dto);
    setAuthCookie(res, result.accessToken);
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: CookieResponse) {
    clearAuthCookie(res);
    return { message: 'Logged out' };
  }
}
