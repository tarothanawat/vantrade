import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Role } from '@vantrade/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { HeartbeatService } from './heartbeat.service';

@Controller('heartbeat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class HeartbeatController {
  constructor(private readonly heartbeatService: HeartbeatService) {}

  @Get('status')
  getStatus() {
    return this.heartbeatService.getStatus();
  }

  /**
   * Manually trigger one heartbeat tick immediately.
   * Useful for testing subscription execution without waiting for the 60-second cron.
   * ADMIN only.
   */
  @Post('trigger')
  @HttpCode(200)
  async trigger() {
    await this.heartbeatService.tick();
    return { triggered: true, triggeredAt: new Date().toISOString() };
  }
}
