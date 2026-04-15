import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { IBrokerAdapter, MarketBarDto, MarketDataBarsQueryDto } from '@vantrade/types';

@Injectable()
export class MarketDataService {
  constructor(@Inject('IBrokerAdapter') private readonly broker: IBrokerAdapter) {}

  async getBars(query: MarketDataBarsQueryDto): Promise<MarketBarDto[]> {
    return this.broker.getRecentBars(query.symbol, query.timeframe, query.limit).catch((err: unknown) => {
      throw new BadRequestException(err instanceof Error ? err.message : `Failed to fetch bars for ${query.symbol}`);
    });
  }
}
