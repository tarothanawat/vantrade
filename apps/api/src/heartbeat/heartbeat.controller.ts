import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
