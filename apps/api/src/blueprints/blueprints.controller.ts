import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Request,
    UseGuards,
    UsePipes,
} from '@nestjs/common';
import type {
    AuthRequest,
    BlueprintCreateDto,
    BlueprintUpdateDto,
    BlueprintVerifyDto,
} from '@vantrade/types';
import {
    BlueprintCreateSchema,
    BlueprintUpdateSchema,
    BlueprintVerifySchema,
    Role,
} from '@vantrade/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BlueprintsService } from './blueprints.service';

@Controller('blueprints')
export class BlueprintsController {
  constructor(private readonly blueprintsService: BlueprintsService) {}

  // PUBLIC — anyone can browse the verified marketplace
  @Get()
  findAll() {
    return this.blueprintsService.findAllVerified();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.blueprintsService.findById(id);
  }

  // PROVIDER — manage own blueprints
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  @UsePipes(new ZodValidationPipe(BlueprintCreateSchema))
  create(@Body() dto: BlueprintCreateDto, @Request() req: AuthRequest) {
    return this.blueprintsService.create(dto, req.user.sub);
  }

  @Get('my/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  findMine(@Request() req: AuthRequest) {
    return this.blueprintsService.findByAuthor(req.user.sub);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(BlueprintUpdateSchema)) dto: BlueprintUpdateDto,
    @Request() req: AuthRequest,
  ) {
    return this.blueprintsService.update(id, dto, req.user.sub);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PROVIDER)
  remove(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.blueprintsService.remove(id, req.user.sub);
  }

  // ADMIN — verify / reject
  @Patch(':id/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  verify(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(BlueprintVerifySchema)) dto: BlueprintVerifyDto,
  ) {
    return this.blueprintsService.verify(id, dto);
  }

  // ADMIN — view all (including unverified)
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findAllAdmin() {
    return this.blueprintsService.findAll();
  }
}
