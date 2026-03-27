import { Module } from '@nestjs/common';
import { TradeLogsRepository } from './trade-logs.repository';

@Module({
  providers: [TradeLogsRepository],
  exports: [TradeLogsRepository],
})
export class TradeLogsModule {}
