import { Injectable, Logger } from '@nestjs/common';
import type { MarketBarDto, MarketDataTimeframe } from '@vantrade/types';
import {
    getCryptoSymbolCandidates,
    isCryptoLikeSymbol,
    normalizeSymbol,
} from './symbol-normalizer';

@Injectable()
export class AlpacaMarketDataClient {
  private readonly logger = new Logger(AlpacaMarketDataClient.name);
  private readonly dataBaseUrl = 'https://data.alpaca.markets';

  private getAuthHeaders(): Record<string, string> {
    return {
      'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '',
      'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? '',
    };
  }

  private calcStartDate(timeframe: MarketDataTimeframe, limit: number): string {
    const periodMs: Record<MarketDataTimeframe, number> = {
      '1Min':  60_000,
      '5Min':  5  * 60_000,
      '15Min': 15 * 60_000,
      '1Hour': 60 * 60_000,
      '1Day':  24 * 60 * 60_000,
    };
    const lookbackMs = limit * 2 * periodMs[timeframe];
    return new Date(Date.now() - lookbackMs).toISOString();
  }

  private toAlpacaTimeframe(timeframe: MarketDataTimeframe): string {
    const map: Record<MarketDataTimeframe, string> = {
      '1Min': '1Min', '5Min': '5Min', '15Min': '15Min', '1Hour': '1Hour', '1Day': '1Day',
    };
    return map[timeframe] ?? '1Min';
  }

  private parseBar(bar: unknown, fallbackSymbol: string): MarketBarDto | null {
    if (typeof bar !== 'object' || bar === null) return null;
    const row = bar as Record<string, unknown>;
    const symbol    = typeof row['S'] === 'string' ? row['S'] : fallbackSymbol;
    const timestamp = new Date(String(row['t'] ?? ''));
    const open      = Number(row['o']);
    const high      = Number(row['h']);
    const low       = Number(row['l']);
    const close     = Number(row['c']);
    const volume    = Number(row['v'] ?? 0);
    if (Number.isNaN(timestamp.getTime())) return null;
    if (![open, high, low, close, volume].every((v) => Number.isFinite(v))) return null;
    return { symbol, timestamp, open, high, low, close, volume };
  }

  private async fetchBarsFromEndpoint(url: URL, symbol: string, limit: number): Promise<MarketBarDto[]> {
    const allBars: MarketBarDto[] = [];
    let nextPageToken: string | null = null;

    do {
      if (nextPageToken) url.searchParams.set('page_token', nextPageToken);

      const response = await fetch(url.toString(), { method: 'GET', headers: this.getAuthHeaders() });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(
          `Failed to fetch bars for ${symbol} (${response.status})${bodyText ? `: ${bodyText}` : ''}`,
        );
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const bars = payload['bars'];
      if (typeof bars !== 'object' || bars === null) break;

      const symbolBars = (bars as Record<string, unknown>)[symbol];
      if (!Array.isArray(symbolBars)) break;

      allBars.push(...symbolBars
        .map((row) => this.parseBar(row, symbol))
        .filter((row): row is MarketBarDto => row !== null));

      nextPageToken = (payload['next_page_token'] as string | null) ?? null;
    } while (nextPageToken !== null && allBars.length < limit);

    return allBars.slice(0, limit);
  }

  private async fetchStockBars(symbol: string, timeframe: MarketDataTimeframe, limit: number): Promise<MarketBarDto[]> {
    const url = new URL(`${this.dataBaseUrl}/v2/stocks/bars`);
    url.searchParams.set('symbols', symbol);
    url.searchParams.set('timeframe', this.toAlpacaTimeframe(timeframe));
    url.searchParams.set('limit', String(Math.min(limit, 10_000)));
    url.searchParams.set('start', this.calcStartDate(timeframe, limit));
    return this.fetchBarsFromEndpoint(url, symbol, limit);
  }

  private async fetchCryptoBars(symbol: string, timeframe: MarketDataTimeframe, limit: number): Promise<MarketBarDto[]> {
    const loc = process.env.ALPACA_CRYPTO_DATA_LOC ?? 'us';
    const url = new URL(`${this.dataBaseUrl}/v1beta3/crypto/${loc}/bars`);
    url.searchParams.set('symbols', symbol);
    url.searchParams.set('timeframe', this.toAlpacaTimeframe(timeframe));
    url.searchParams.set('limit', String(Math.min(limit, 10_000)));
    url.searchParams.set('start', this.calcStartDate(timeframe, limit));
    return this.fetchBarsFromEndpoint(url, symbol, limit);
  }

  async getLatestCryptoPrice(symbol: string): Promise<number | null> {
    const loc = process.env.ALPACA_CRYPTO_DATA_LOC ?? 'us';

    // Try latest bar close first
    const barUrl = `${this.dataBaseUrl}/v1beta3/crypto/${loc}/latest/bars?symbols=${encodeURIComponent(symbol)}`;
    const barRes = await fetch(barUrl, { method: 'GET', headers: this.getAuthHeaders() });
    if (barRes.ok) {
      const payload = (await barRes.json()) as unknown;
      if (typeof payload === 'object' && payload !== null) {
        const maybeBars = (payload as Record<string, unknown>)['bars'];
        if (typeof maybeBars === 'object' && maybeBars !== null) {
          const bar = (maybeBars as Record<string, unknown>)[symbol];
          if (typeof bar === 'object' && bar !== null) {
            const close = Number((bar as Record<string, unknown>)['c']);
            if (Number.isFinite(close) && close > 0) return close;
          }
        }
      }
    } else {
      const body = await barRes.text().catch(() => '');
      this.logger.warn(`Crypto bar lookup failed for ${symbol} (${barRes.status})${body ? `: ${body}` : ''}`);
    }

    // Fallback: quote midpoint
    const quoteUrl = `${this.dataBaseUrl}/v1beta3/crypto/${loc}/latest/quotes?symbols=${encodeURIComponent(symbol)}`;
    const quoteRes = await fetch(quoteUrl, { method: 'GET', headers: this.getAuthHeaders() });
    if (!quoteRes.ok) {
      const body = await quoteRes.text().catch(() => '');
      this.logger.warn(`Crypto quote fallback failed for ${symbol} (${quoteRes.status})${body ? `: ${body}` : ''}`);
      return null;
    }

    const payload = (await quoteRes.json()) as unknown;
    if (typeof payload !== 'object' || payload === null) return null;
    const maybeQuotes = (payload as Record<string, unknown>)['quotes'];
    if (typeof maybeQuotes !== 'object' || maybeQuotes === null) return null;
    const quote = (maybeQuotes as Record<string, unknown>)[symbol];
    if (typeof quote !== 'object' || quote === null) return null;
    const bid = Number((quote as Record<string, unknown>)['bp']);
    const ask = Number((quote as Record<string, unknown>)['ap']);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) return null;
    return (bid + ask) / 2;
  }

  async getRecentBars(symbol: string, timeframe: MarketDataTimeframe, limit: number): Promise<MarketBarDto[]> {
    const normalized = normalizeSymbol(symbol);

    if (isCryptoLikeSymbol(normalized)) {
      const candidates = getCryptoSymbolCandidates(normalized);
      for (const candidate of candidates) {
        try {
          const bars = await this.fetchCryptoBars(candidate, timeframe, limit);
          if (bars.length > 0) return bars;
        } catch (err) {
          this.logger.warn(`Crypto bars lookup failed for ${candidate}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
      throw new Error(`No bar data returned for ${symbol}. Tried: ${candidates.join(', ')}`);
    }

    return this.fetchStockBars(normalized, timeframe, limit);
  }

  async getHistoricalPrices(symbol: string, limit: number): Promise<number[]> {
    const bars = await this.getRecentBars(symbol, '1Min', limit);
    return bars.map((bar) => bar.close);
  }

  /**
   * Returns the latest price for a crypto symbol (trying all candidate formats),
   * or null if the symbol is not crypto-like. Throws if crypto but no price found.
   * Used by AlpacaAdapter.getLatestPrice to keep crypto routing out of the adapter.
   */
  async tryGetLatestCryptoPrice(symbol: string): Promise<number | null> {
    if (!isCryptoLikeSymbol(symbol)) return null;
    const candidates = getCryptoSymbolCandidates(symbol);
    for (const candidate of candidates) {
      const price = await this.getLatestCryptoPrice(candidate);
      if (price && price > 0) return price;
    }
    throw new Error(`No price data returned for ${symbol}. Tried: ${candidates.join(', ')}`);
  }
}
