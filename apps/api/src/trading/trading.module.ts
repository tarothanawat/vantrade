import { Module } from '@nestjs/common';
import { AlpacaMarketDataClient } from './broker/alpaca-market-data.client';
import { AlpacaAdapter } from './broker/alpaca.adapter';

@Module({
  providers: [
    AlpacaMarketDataClient,
    {
      provide: 'IBrokerAdapter',
      useClass: AlpacaAdapter,
    },
  ],
  exports: ['IBrokerAdapter'],
})
export class TradingModule {}
