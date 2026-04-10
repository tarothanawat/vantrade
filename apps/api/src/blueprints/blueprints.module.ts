import { Module } from '@nestjs/common';
import { TradingModule } from '../trading/trading.module';
import { BlueprintsController } from './blueprints.controller';
import { BlueprintsRepository } from './blueprints.repository';
import { BlueprintsService } from './blueprints.service';

@Module({
  imports: [TradingModule],
  controllers: [BlueprintsController],
  providers: [BlueprintsService, BlueprintsRepository],
  exports: [BlueprintsRepository],
})
export class BlueprintsModule {}
