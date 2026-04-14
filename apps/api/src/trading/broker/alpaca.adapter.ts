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
} from './symbol-normalizer';
import { AlpacaMarketDataClient } from './alpaca-market-data.client';

@Injectable()
export class AlpacaAdapter implements IBrokerAdapter {
  private readonly logger = new Logger(AlpacaAdapter.name);

  constructor(private readonly marketData: AlpacaMarketDataClient) {}

  private buildClient(apiKey: string, apiSecret: string): Alpaca {
    return new Alpaca({
      keyId: apiKey,
      secretKey: apiSecret,
      paper: true,
      baseUrl: 'https://paper-api.alpaca.markets',
    });
  }

  // ── Market data — delegated to AlpacaMarketDataClient ──────────────────────

  getRecentBars(symbol: string, timeframe: MarketDataTimeframe, limit: number): Promise<MarketBarDto[]> {
    return this.marketData.getRecentBars(symbol, timeframe, limit);
  }

  getHistoricalPrices(symbol: string, limit: number): Promise<number[]> {
    return this.marketData.getHistoricalPrices(symbol, limit);
  }

  async getLatestPrice(symbol: string): Promise<number> {
    if (isCryptoLikeSymbol(symbol)) {
      const candidates = getCryptoSymbolCandidates(symbol);
      for (const candidate of candidates) {
        const price = await this.marketData.getLatestCryptoPrice(candidate);
        if (price && price > 0) return price;
      }
      throw new Error(`No price data returned for ${symbol}. Tried: ${candidates.join(', ')}`);
    }

    const client = this.buildClient(
      process.env.ALPACA_API_KEY ?? '',
      process.env.ALPACA_API_SECRET ?? '',
    );
    const candidates = getStockSymbolCandidates(symbol);
    let lastError: Error | null = null;

    for (const candidate of candidates) {
      try {
        const bars = await client.getBarsV2(candidate, { timeframe: '1Min', limit: 1 });
        for await (const bar of bars) return bar.ClosePrice as number;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown Alpaca bars error');
        this.logger.warn(`Price lookup failed for ${candidate}: ${lastError.message}`);
      }
    }

    throw new Error(`No price data returned for ${symbol}. Tried: ${candidates.join(', ')}${lastError ? ` (${lastError.message})` : ''}`);
  }

  // ── Order placement ────────────────────────────────────────────────────────

  async placeOrderWithCredentials(params: OrderParams, apiKey: string, apiSecret: string): Promise<OrderResult> {
    const client = this.buildClient(apiKey, apiSecret);
    const candidates = getStockSymbolCandidates(params.symbol);
    return params.limitOrder
      ? this.placeBracketLimitOrder(client, params, candidates)
      : this.placeMarketOrder(client, params, candidates);
  }

  async placeOrder(params: OrderParams): Promise<OrderResult> {
    return this.placeOrderWithCredentials(
      params,
      process.env.ALPACA_API_KEY ?? '',
      process.env.ALPACA_API_SECRET ?? '',
    );
  }

  private async placeMarketOrder(client: Alpaca, params: OrderParams, candidates: string[]): Promise<OrderResult> {
    let order: Record<string, unknown> | null = null;
    let placedSymbol = params.symbol;
    let lastError: Error | null = null;

    for (const candidate of candidates) {
      try {
        order = (await client.createOrder({
          symbol: candidate, qty: params.quantity, side: params.side, type: 'market', time_in_force: 'day',
        })) as Record<string, unknown>;
        placedSymbol = candidate;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown Alpaca order error');
        this.logger.warn(`Order placement failed for ${candidate}: ${lastError.message}`);
      }
    }

    if (!order) {
      throw new Error(`Failed to place order for ${params.symbol}. Tried: ${candidates.join(', ')}${lastError ? ` (${lastError.message})` : ''}`);
    }

    this.logger.log(`Market order placed: ${params.side.toUpperCase()} ${params.quantity} ${placedSymbol} — orderId=${order['id']}`);
    return this.mapOrderResult(order);
  }

  private async placeBracketLimitOrder(client: Alpaca, params: OrderParams, candidates: string[]): Promise<OrderResult> {
    const { limitPrice, stopLossPrice, takeProfitPrice } = params.limitOrder!;
    let order: Record<string, unknown> | null = null;
    let placedSymbol = params.symbol;
    let lastError: Error | null = null;

    for (const candidate of candidates) {
      try {
        order = (await client.createOrder({
          symbol: candidate, qty: params.quantity, side: params.side,
          type: 'limit', time_in_force: 'day', order_class: 'bracket',
          limit_price: limitPrice,
          stop_loss: { stop_price: stopLossPrice },
          take_profit: { limit_price: takeProfitPrice },
        })) as Record<string, unknown>;
        placedSymbol = candidate;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown Alpaca order error');
        this.logger.warn(`Bracket order failed for ${candidate}: ${lastError.message}`);
      }
    }

    if (!order) {
      throw new Error(`Failed to place bracket order for ${params.symbol}. Tried: ${candidates.join(', ')}${lastError ? ` (${lastError.message})` : ''}`);
    }

    this.logger.log(
      `Bracket limit order placed: ${params.side.toUpperCase()} ${params.quantity} ${placedSymbol}` +
      ` limit=${limitPrice} sl=${stopLossPrice} tp=${takeProfitPrice} — orderId=${order['id']}`,
    );
    return this.mapOrderResult(order);
  }

  // ── Account / position management ─────────────────────────────────────────

  async getPositions(accountId: string): Promise<Position[]> {
    this.logger.debug(`Fetching positions for accountId=${accountId}`);
    const client = this.buildClient(process.env.ALPACA_API_KEY ?? '', process.env.ALPACA_API_SECRET ?? '');
    return this.mapPositions(await client.getPositions() as Array<Record<string, unknown>>);
  }

  async getPositionsWithCredentials(apiKey: string, apiSecret: string): Promise<Position[]> {
    return this.mapPositions(
      await this.buildClient(apiKey, apiSecret).getPositions() as Array<Record<string, unknown>>,
    );
  }

  async verifyCredentials(apiKey: string, apiSecret: string): Promise<boolean> {
    try {
      await this.buildClient(apiKey, apiSecret).getAccount();
      return true;
    } catch {
      return false;
    }
  }

  // ── Response mapping ───────────────────────────────────────────────────────

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
