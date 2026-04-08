import { Module } from '@nestjs/common';
import { TradingModule } from '../trading/trading.module';
import { MarketDataController } from './market-data.controller';
import { MarketDataService } from './market-data.service';

@Module({
  imports: [TradingModule],
  controllers: [MarketDataController],
  providers: [MarketDataService],
})
export class MarketDataModule {}
