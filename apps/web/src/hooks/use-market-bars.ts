'use client';

import { marketDataClient } from '@/lib/api-client/market-data.client';
import { MarketDataBarsQuerySchema, type MarketBarDto, type MarketDataTimeframe } from '@vantrade/types';
import { useEffect, useState } from 'react';

const TIMEFRAME_LIMITS: Record<MarketDataTimeframe, number> = {
  '1Min': 120,
  '5Min': 100,
  '15Min': 96,
  '1Hour': 72,
  '1Day': 90,
};

export function useMarketBars(symbol: string, timeframe: MarketDataTimeframe) {
  const [bars, setBars] = useState<MarketBarDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const limit = TIMEFRAME_LIMITS[timeframe];

    async function load() {
      const parsed = MarketDataBarsQuerySchema.safeParse({ symbol, timeframe, limit });

      if (!parsed.success) {
        if (!cancelled) {
          setError('Invalid market query settings.');
          setBars([]);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
        setError('');
      }

      try {
        const data = await marketDataClient.getBars(parsed.data);
        if (!cancelled) setBars(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load market data');
          setBars([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframe]);

  return { bars, loading, error };
}
