import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Post,
    UsePipes,
} from '@nestjs/common';
import type { LoginDto, RegisterDto } from '@vantrade/types';
import { LoginSchema, RegisterSchema } from '@vantrade/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ZodValidationPipe(LoginSchema))
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
