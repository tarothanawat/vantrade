import { Module } from '@nestjs/common';
import { BlueprintsController } from './blueprints.controller';
import { BlueprintsRepository } from './blueprints.repository';
import { BlueprintsService } from './blueprints.service';

@Module({
  controllers: [BlueprintsController],
  providers: [BlueprintsService, BlueprintsRepository],
  exports: [BlueprintsRepository],
})
export class BlueprintsModule {}
