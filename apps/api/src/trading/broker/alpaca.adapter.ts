import Alpaca from '@alpacahq/alpaca-trade-api';
import { Injectable, Logger } from '@nestjs/common';
import type {
    IBrokerAdapter,
    MarketBarDto,
    MarketDataTimeframe,
    OrderParams,
    OrderResult,
    Position,
} from '@vantrade/types';
import { OrderSide, OrderStatus } from '@vantrade/types';
import {
    getCryptoSymbolCandidates,
    getStockSymbolCandidates,
    isCryptoLikeSymbol,
    normalizeSymbol,
} from './symbol-normalizer';

@Injectable()
export class AlpacaAdapter implements IBrokerAdapter {
  private readonly logger = new Logger(AlpacaAdapter.name);
  private readonly cryptoDataBaseUrl = 'https://data.alpaca.markets';

  /**
   * Computes an ISO start date so Alpaca returns enough historical bars.
   * Uses a 2× buffer to account for weekends, market closure, and holidays.
   */
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
    switch (timeframe) {
      case '1Min':
        return '1Min';
      case '5Min':
        return '5Min';
      case '15Min':
        return '15Min';
      case '1Hour':
        return '1Hour';
      case '1Day':
        return '1Day';
      default:
        return '1Min';
    }
  }

  private parseBar(bar: unknown, fallbackSymbol: string): MarketBarDto | null {
    if (typeof bar !== 'object' || bar === null) return null;

    const row = bar as Record<string, unknown>;
    const symbol = typeof row['S'] === 'string' ? row['S'] : fallbackSymbol;
    const timestampRaw = row['t'];
    const openRaw = row['o'];
    const highRaw = row['h'];
    const lowRaw = row['l'];
    const closeRaw = row['c'];
    const volumeRaw = row['v'];

    const timestamp = new Date(String(timestampRaw ?? ''));
    const open = Number(openRaw);
    const high = Number(highRaw);
    const low = Number(lowRaw);
    const close = Number(closeRaw);
    const volume = Number(volumeRaw ?? 0);

    if (Number.isNaN(timestamp.getTime())) return null;
    if (![open, high, low, close, volume].every((value) => Number.isFinite(value))) return null;

    return {
      symbol,
      timestamp,
      open,
      high,
      low,
      close,
      volume,
    };
  }

  /**
   * Shared paginated fetch loop used by both stock and crypto bar endpoints.
   * Mutates `url` on each iteration to append the next-page token.
   */
  private async fetchBarsFromEndpoint(
    url: URL,
    symbol: string,
    limit: number,
  ): Promise<MarketBarDto[]> {
    const allBars: MarketBarDto[] = [];
    let nextPageToken: string | null = null;

    do {
      if (nextPageToken) url.searchParams.set('page_token', nextPageToken);

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: this.getDataAuthHeaders(),
      });

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

      const parsed = symbolBars
        .map((row) => this.parseBar(row, symbol))
        .filter((row): row is MarketBarDto => row !== null);
      allBars.push(...parsed);

      nextPageToken = (payload['next_page_token'] as string | null) ?? null;
    } while (nextPageToken !== null && allBars.length < limit);

    return allBars.slice(0, limit);
  }

  private async fetchStockBars(
    symbol: string,
    timeframe: MarketDataTimeframe,
    limit: number,
  ): Promise<MarketBarDto[]> {
    const url = new URL(`${this.cryptoDataBaseUrl}/v2/stocks/bars`);
    url.searchParams.set('symbols', symbol);
    url.searchParams.set('timeframe', this.toAlpacaTimeframe(timeframe));
    url.searchParams.set('limit', String(Math.min(limit, 10_000)));
    url.searchParams.set('start', this.calcStartDate(timeframe, limit));
    return this.fetchBarsFromEndpoint(url, symbol, limit);
  }

  private async fetchCryptoBars(
    symbol: string,
    timeframe: MarketDataTimeframe,
    limit: number,
  ): Promise<MarketBarDto[]> {
    const loc = process.env.ALPACA_CRYPTO_DATA_LOC ?? 'us';
    const url = new URL(`${this.cryptoDataBaseUrl}/v1beta3/crypto/${loc}/bars`);
    url.searchParams.set('symbols', symbol);
    url.searchParams.set('timeframe', this.toAlpacaTimeframe(timeframe));
    url.searchParams.set('limit', String(Math.min(limit, 10_000)));
    url.searchParams.set('start', this.calcStartDate(timeframe, limit));
    return this.fetchBarsFromEndpoint(url, symbol, limit);
  }

  private getDataAuthHeaders(): Record<string, string> {
    return {
      'APCA-API-KEY-ID': process.env.ALPACA_API_KEY ?? '',
      'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET ?? '',
    };
  }

  private async getLatestCryptoBarClose(symbol: string): Promise<number | null> {
    const loc = process.env.ALPACA_CRYPTO_DATA_LOC ?? 'us';
    const url = `${this.cryptoDataBaseUrl}/v1beta3/crypto/${loc}/latest/bars?symbols=${encodeURIComponent(symbol)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getDataAuthHeaders(),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      this.logger.warn(
        `Crypto bar lookup failed for ${symbol} with status ${response.status}${bodyText ? `: ${bodyText}` : ''}`,
      );
      return null;
    }

    const payload = (await response.json()) as unknown;
    if (typeof payload !== 'object' || payload === null) return null;

    const maybeBars = (payload as Record<string, unknown>)['bars'];
    if (typeof maybeBars !== 'object' || maybeBars === null) return null;

    const bar = (maybeBars as Record<string, unknown>)[symbol];
    if (typeof bar !== 'object' || bar === null) return null;

    const closePrice = Number((bar as Record<string, unknown>)['c']);
    if (!Number.isFinite(closePrice) || closePrice <= 0) return null;

    return closePrice;
  }

  private async getLatestCryptoQuoteMidpoint(symbol: string): Promise<number | null> {
    const loc = process.env.ALPACA_CRYPTO_DATA_LOC ?? 'us';
    const url = `${this.cryptoDataBaseUrl}/v1beta3/crypto/${loc}/latest/quotes?symbols=${encodeURIComponent(symbol)}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getDataAuthHeaders(),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      this.logger.warn(
        `Crypto quote fallback failed for ${symbol} with status ${response.status}${bodyText ? `: ${bodyText}` : ''}`,
      );
      return null;
    }

    const payload = (await response.json()) as unknown;
    if (typeof payload !== 'object' || payload === null) return null;

    const maybeQuotes = (payload as Record<string, unknown>)['quotes'];
    if (typeof maybeQuotes !== 'object' || maybeQuotes === null) return null;

    const quote = (maybeQuotes as Record<string, unknown>)[symbol];
    if (typeof quote !== 'object' || quote === null) return null;

    const bidPrice = Number((quote as Record<string, unknown>)['bp']);
    const askPrice = Number((quote as Record<string, unknown>)['ap']);
    if (!Number.isFinite(bidPrice) || !Number.isFinite(askPrice)) return null;
    if (bidPrice <= 0 || askPrice <= 0) return null;

    return (bidPrice + askPrice) / 2;
  }

  private buildClient(apiKey: string, apiSecret: string): Alpaca {
    return new Alpaca({
      keyId: apiKey,
      secretKey: apiSecret,
      paper: true,
      baseUrl: 'https://paper-api.alpaca.markets',
    });
  }

  async getLatestPrice(symbol: string): Promise<number> {
    if (isCryptoLikeSymbol(symbol)) {
      const cryptoCandidates = getCryptoSymbolCandidates(symbol);

      for (const candidate of cryptoCandidates) {
        const barClose = await this.getLatestCryptoBarClose(candidate);
        if (barClose && barClose > 0) return barClose;

        const midpoint = await this.getLatestCryptoQuoteMidpoint(candidate);
        if (midpoint && midpoint > 0) {
          this.logger.debug(`Using crypto quote midpoint fallback for ${symbol} (${candidate}): ${midpoint}`);
          return midpoint;
        }
      }

      throw new Error(`No price data returned for ${symbol}. Tried: ${cryptoCandidates.join(', ')}`);
    }

    // Use system-level credentials for price checks (no trade execution)
    const client = this.buildClient(
      process.env.ALPACA_API_KEY ?? '',
      process.env.ALPACA_API_SECRET ?? '',
    );

    const symbolCandidates = getStockSymbolCandidates(symbol);
    let lastError: Error | null = null;

    for (const candidate of symbolCandidates) {
      try {
        const barQuery = { timeframe: '1Min', limit: 1 };
        const bars = await client.getBarsV2(candidate, barQuery);
        for await (const bar of bars) return bar.ClosePrice as number;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown Alpaca bars error');
        lastError = error;
        this.logger.warn(
          `Price lookup failed for symbol variant ${candidate}: ${error.message}`,
        );
      }
    }

    const tried = symbolCandidates.join(', ');

    if (lastError) {
      throw new Error(`No price data returned for ${symbol}. Tried: ${tried}`);
    }

    throw new Error(`No price data returned for ${symbol}. Tried: ${tried}`);
  }

  async getRecentBars(
    symbol: string,
    timeframe: MarketDataTimeframe,
    limit: number,
  ): Promise<MarketBarDto[]> {
    const normalized = normalizeSymbol(symbol);

    if (isCryptoLikeSymbol(normalized)) {
      const cryptoCandidates = getCryptoSymbolCandidates(normalized);
      for (const candidate of cryptoCandidates) {
        try {
          const bars = await this.fetchCryptoBars(candidate, timeframe, limit);
          if (bars.length > 0) return bars;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown crypto bars error';
          this.logger.warn(`Crypto bars lookup failed for ${candidate}: ${message}`);
        }
      }

      throw new Error(`No bar data returned for ${symbol}. Tried: ${cryptoCandidates.join(', ')}`);
    }

    return this.fetchStockBars(normalized, timeframe, limit);
  }

  async getHistoricalPrices(symbol: string, limit: number): Promise<number[]> {
    const bars = await this.getRecentBars(symbol, '1Min', limit);
    return bars.map((bar) => bar.close);
  }

  async placeOrderWithCredentials(
    params: OrderParams,
    apiKey: string,
    apiSecret: string,
  ): Promise<OrderResult> {
    const client = this.buildClient(apiKey, apiSecret);
    const symbolCandidates = getStockSymbolCandidates(params.symbol);

    if (params.limitOrder) {
      return this.placeBracketLimitOrder(client, params, symbolCandidates);
    }
    return this.placeMarketOrder(client, params, symbolCandidates);
  }

  private async placeMarketOrder(
    client: Alpaca,
    params: OrderParams,
    symbolCandidates: string[],
  ): Promise<OrderResult> {
    let order: Record<string, unknown> | null = null;
    let placedSymbol = params.symbol;
    let lastError: Error | null = null;

    for (const candidate of symbolCandidates) {
      try {
        const orderParams = { symbol: candidate, qty: params.quantity, side: params.side, type: 'market', time_in_force: 'day' };
        order = (await client.createOrder(orderParams)) as Record<string, unknown>;
        placedSymbol = candidate;
        break;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown Alpaca order error');
        lastError = error;
        this.logger.warn(`Order placement failed for symbol variant ${candidate}: ${error.message}`);
      }
    }

    if (!order) {
      const tried = symbolCandidates.join(', ');
      throw new Error(
        `Failed to place order for ${params.symbol}. Tried: ${tried}${lastError ? ` (${lastError.message})` : ''}`,
      );
    }

    this.logger.log(
      `Market order placed: ${params.side.toUpperCase()} ${params.quantity} ${placedSymbol} — orderId=${order['id']}`,
    );

    return this.mapOrderResult(order);
  }

  private async placeBracketLimitOrder(
    client: Alpaca,
    params: OrderParams,
    symbolCandidates: string[],
  ): Promise<OrderResult> {
    const { limitPrice, stopLossPrice, takeProfitPrice } = params.limitOrder!;
    let order: Record<string, unknown> | null = null;
    let placedSymbol = params.symbol;
    let lastError: Error | null = null;

    for (const candidate of symbolCandidates) {
      try {
        const orderParams = {
          symbol: candidate, qty: params.quantity, side: params.side,
          type: 'limit', time_in_force: 'day', order_class: 'bracket',
          limit_price: limitPrice,
          stop_loss: { stop_price: stopLossPrice },
          take_profit: { limit_price: takeProfitPrice },
        };
        order = (await client.createOrder(orderParams)) as Record<string, unknown>;
        placedSymbol = candidate;
        break;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown Alpaca order error');
        lastError = error;
        this.logger.warn(
          `Bracket order placement failed for symbol variant ${candidate}: ${error.message}`,
        );
      }
    }

    if (!order) {
      const tried = symbolCandidates.join(', ');
      throw new Error(
        `Failed to place bracket order for ${params.symbol}. Tried: ${tried}${lastError ? ` (${lastError.message})` : ''}`,
      );
    }

    this.logger.log(
      `Bracket limit order placed: ${params.side.toUpperCase()} ${params.quantity} ${placedSymbol}` +
        ` limit=${limitPrice} sl=${stopLossPrice} tp=${takeProfitPrice} — orderId=${order['id']}`,
    );

    return this.mapOrderResult(order);
  }

  async placeOrder(params: OrderParams): Promise<OrderResult> {
    return this.placeOrderWithCredentials(
      params,
      process.env.ALPACA_API_KEY ?? '',
      process.env.ALPACA_API_SECRET ?? '',
    );
  }

  async getPositions(accountId: string): Promise<Position[]> {
    this.logger.debug(`Fetching positions for accountId=${accountId}`);
    const client = this.buildClient(
      process.env.ALPACA_API_KEY ?? '',
      process.env.ALPACA_API_SECRET ?? '',
    );
    const positions = await client.getPositions();
    return this.mapPositions(positions as Array<Record<string, unknown>>);
  }

  async getPositionsWithCredentials(apiKey: string, apiSecret: string): Promise<Position[]> {
    const client = this.buildClient(apiKey, apiSecret);
    const positions = await client.getPositions();
    return this.mapPositions(positions as Array<Record<string, unknown>>);
  }

  async verifyCredentials(apiKey: string, apiSecret: string): Promise<boolean> {
    try {
      const client = this.buildClient(apiKey, apiSecret);
      await client.getAccount();
      return true;
    } catch {
      return false;
    }
  }

  private mapOrderResult(order: Record<string, unknown>): OrderResult {
    return {
      orderId: order['id'] as string,
      symbol: order['symbol'] as string,
      side: order['side'] as OrderSide,
      quantity: Number(order['qty']),
      filledPrice: Number(order['filled_avg_price'] ?? 0),
      status: (order['status'] as OrderStatus) ?? OrderStatus.PENDING,
    };
  }

  private mapPositions(raw: Array<Record<string, unknown>>): Position[] {
    return raw.map((p) => ({
      symbol: p['symbol'] as string,
      quantity: Number(p['qty']),
      averageEntryPrice: Number(p['avg_entry_price']),
      currentPrice: Number(p['current_price']),
      unrealizedPnl: Number(p['unrealized_pl']),
    }));
  }
}
