import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Request,
    Res,
    UseGuards,
    UsePipes,
} from '@nestjs/common';
import type { AssignRoleDto, AuthRequest, LoginDto, RegisterDto } from '@vantrade/types';
import { AssignRoleSchema, LoginSchema, RegisterSchema, Role } from '@vantrade/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

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

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: AuthRequest) {
    return {
      user: {
        id: req.user.sub,
        email: req.user.email,
        role: req.user.role,
      },
    };
  }

  // ADMIN — list all users
  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  listUsers() {
    return this.authService.listUsers();
  }

  // ADMIN — assign a role to a user
  @Patch('users/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  assignRole(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(AssignRoleSchema)) dto: AssignRoleDto,
  ) {
    return this.authService.assignRole(id, dto);
  }
}
