import { Module } from '@nestjs/common';
import { TradingModule } from '../trading/trading.module';
import { BacktestService } from './backtest.service';
import { BlueprintsController } from './blueprints.controller';
import { BlueprintsRepository } from './blueprints.repository';
import { BlueprintsService } from './blueprints.service';

@Module({
  imports: [TradingModule],
  controllers: [BlueprintsController],
  providers: [BlueprintsService, BacktestService, BlueprintsRepository],
  exports: [BlueprintsRepository],
})
export class BlueprintsModule {}
