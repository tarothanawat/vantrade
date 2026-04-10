import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import type { AuthRequest } from '@vantrade/types';
import { Role } from '@vantrade/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PositionsService } from './positions.service';

@Controller('positions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TESTER)
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Get()
  getPositions(@Request() req: AuthRequest) {
    return this.positionsService.getPositions(req.user.sub);
  }
}
