import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Request,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ApiKeyCreateSchema, Role } from '@vantrade/types';
import type { ApiKeyCreateDto, AuthRequest } from '@vantrade/types';

@Controller('api-keys')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TESTER)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get('status')
  hasKey(@Request() req: AuthRequest) {
    return this.apiKeysService.hasKey(req.user.sub);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(ApiKeyCreateSchema))
  upsert(@Body() dto: ApiKeyCreateDto, @Request() req: AuthRequest) {
    return this.apiKeysService.upsert(dto, req.user.sub);
  }

  @Delete()
  remove(@Request() req: AuthRequest) {
    return this.apiKeysService.remove(req.user.sub);
  }
}
