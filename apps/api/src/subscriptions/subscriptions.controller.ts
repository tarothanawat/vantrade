import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type {
  AuthRequest,
  SubscriptionCreateDto,
  SubscriptionToggleDto,
} from '@vantrade/types';
import {
  Role,
  SubscriptionCreateSchema,
  SubscriptionToggleSchema,
} from '@vantrade/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TESTER)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  findMine(@Request() req: AuthRequest) {
    return this.subscriptionsService.findByUser(req.user.sub);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(SubscriptionCreateSchema))
  create(@Body() dto: SubscriptionCreateDto, @Request() req: AuthRequest) {
    return this.subscriptionsService.create(dto, req.user.sub);
  }

  @Patch(':id/toggle')
  toggle(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SubscriptionToggleSchema)) dto: SubscriptionToggleDto,
    @Request() req: AuthRequest,
  ) {
    return this.subscriptionsService.toggle(id, req.user.sub, dto.isActive);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.subscriptionsService.remove(id, req.user.sub);
  }

  @Get(':id/trade-logs')
  findTradeLogs(
    @Param('id') id: string,
    @Request() req: AuthRequest,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.subscriptionsService.findTradeLogsBySubscription(
      id,
      req.user.sub,
      take !== undefined ? Number(take) : undefined,
      skip !== undefined ? Number(skip) : undefined,
    );
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.subscriptionsService.getStats(id, req.user.sub);
  }
}
