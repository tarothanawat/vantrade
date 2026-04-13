import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiKeyCreateSchema, ApiKeyDeleteSchema, Role } from '@vantrade/types';
import type { ApiKeyCreateDto, ApiKeyDeleteDto, AuthRequest } from '@vantrade/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApiKeysService } from './api-keys.service';

@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TESTER)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get('status')
  hasKey(@Request() req: AuthRequest) {
    return this.apiKeysService.hasKey(req.user.sub);
  }

  @Get()
  listKeys(@Request() req: AuthRequest) {
    return this.apiKeysService.listKeys(req.user.sub);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(ApiKeyCreateSchema))
  upsert(@Body() dto: ApiKeyCreateDto, @Request() req: AuthRequest) {
    return this.apiKeysService.upsert(dto, req.user.sub);
  }

  @Delete()
  @UsePipes(new ZodValidationPipe(ApiKeyDeleteSchema))
  remove(@Body() dto: ApiKeyDeleteDto, @Request() req: AuthRequest) {
    return this.apiKeysService.remove(dto, req.user.sub);
  }

  @Post('verify')
  verify(@Request() req: AuthRequest, @Query('label') label?: string) {
    return this.apiKeysService.verify(req.user.sub, label ?? 'default');
  }
}
