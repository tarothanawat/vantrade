import {
    MarketBarListResponseSchema,
    type MarketDataBarsQueryDto,
} from '@vantrade/types';
import { apiClient } from './base';

function toQueryString(query: MarketDataBarsQueryDto): string {
  const params = new URLSearchParams({
    symbol: query.symbol,
    timeframe: query.timeframe,
    limit: String(query.limit),
  });
  return params.toString();
}

export const marketDataClient = {
  getBars: (query: MarketDataBarsQueryDto) =>
    apiClient.get(`/market-data/bars?${toQueryString(query)}`, undefined, MarketBarListResponseSchema),
};
