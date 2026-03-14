import { Module } from '@nestjs/common';
import { AlpacaAdapter } from './broker/alpaca.adapter';

@Module({
  providers: [
    {
      provide: 'IBrokerAdapter',
      useClass: AlpacaAdapter,
    },
  ],
  exports: ['IBrokerAdapter'],
})
export class TradingModule {}
