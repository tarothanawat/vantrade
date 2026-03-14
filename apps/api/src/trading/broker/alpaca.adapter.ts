import Alpaca from '@alpacahq/alpaca-trade-api';
import { Injectable, Logger } from '@nestjs/common';
import type { IBrokerAdapter, OrderParams, OrderResult, Position } from '@vantrade/types';
import { OrderSide, OrderStatus } from '@vantrade/types';

@Injectable()
export class AlpacaAdapter implements IBrokerAdapter {
  private readonly logger = new Logger(AlpacaAdapter.name);

  private buildClient(apiKey: string, apiSecret: string): Alpaca {
    return new Alpaca({
      keyId: apiKey,
      secretKey: apiSecret,
      paper: true,
      baseUrl: 'https://paper-api.alpaca.markets',
    });
  }

  async getLatestPrice(symbol: string): Promise<number> {
    // Use system-level credentials for price checks (no trade execution)
    const client = this.buildClient(
      process.env.ALPACA_API_KEY ?? '',
      process.env.ALPACA_API_SECRET ?? '',
    );

    const bars = await client.getBarsV2(symbol, {
      timeframe: '1Min',
      limit: 1,
    });

    for await (const bar of bars) {
      return bar.ClosePrice as number;
    }

    throw new Error(`No price data returned for ${symbol}`);
  }

  async placeOrder(_params: OrderParams): Promise<OrderResult> {
    throw new Error(
      'AlpacaAdapter.placeOrder requires per-subscription credentials. Use placeOrderWithCredentials instead.',
    );
  }

  async placeOrderWithCredentials(
    params: OrderParams,
    apiKey: string,
    apiSecret: string,
  ): Promise<OrderResult> {
    const client = this.buildClient(apiKey, apiSecret);

    const order = await client.createOrder({
      symbol: params.symbol,
      qty: params.quantity,
      side: params.side,
      type: 'market',
      time_in_force: 'day',
    });

    this.logger.log(
      `Order placed: ${params.side.toUpperCase()} ${params.quantity} ${params.symbol} — orderId=${order.id}`,
    );

    return {
      orderId: order.id as string,
      symbol: order.symbol as string,
      side: order.side as OrderSide,
      quantity: Number(order.qty),
      filledPrice: Number(order.filled_avg_price ?? 0),
      status: (order.status as OrderStatus) ?? OrderStatus.PENDING,
    };
  }

  async getPositions(accountId: string): Promise<Position[]> {
    this.logger.warn(`getPositions called with accountId=${accountId} — using system credentials`);

    const client = this.buildClient(
      process.env.ALPACA_API_KEY ?? '',
      process.env.ALPACA_API_SECRET ?? '',
    );

    const positions = await client.getPositions();
    return (positions as Array<Record<string, unknown>>).map((p) => ({
      symbol: p['symbol'] as string,
      quantity: Number(p['qty']),
      averageEntryPrice: Number(p['avg_entry_price']),
      currentPrice: Number(p['current_price']),
      unrealizedPnl: Number(p['unrealized_pl']),
    }));
  }
}
