import Alpaca from '@alpacahq/alpaca-trade-api';
import { Injectable, Logger } from '@nestjs/common';
import type {
  BrokerCredentials,
  IBrokerAdapter,
  OrderParams,
  OrderResult,
  Position,
} from '@vantrade/types';
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

  async getHistoricalPrices(symbol: string, limit: number): Promise<number[]> {
    const client = this.buildClient(
      process.env.ALPACA_API_KEY ?? '',
      process.env.ALPACA_API_SECRET ?? '',
    );

    const bars = client.getBarsV2(symbol, {
      timeframe: '1Min',
      limit,
    });

    const prices: number[] = [];
    for await (const bar of bars) {
      prices.push(bar.ClosePrice as number);
    }

    if (prices.length === 0) {
      throw new Error(`No price data returned for ${symbol}`);
    }

    return prices;
  }

  async getLatestPrice(symbol: string): Promise<number> {
    const prices = await this.getHistoricalPrices(symbol, 1);
    return prices[prices.length - 1];
  }

  async placeOrder(params: OrderParams, credentials: BrokerCredentials): Promise<OrderResult> {
    const client = this.buildClient(credentials.apiKey, credentials.apiSecret);

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

  async getPositions(accountId: string, credentials: BrokerCredentials): Promise<Position[]> {
    this.logger.debug(`Fetching positions for accountId=${accountId}`);
    const client = this.buildClient(credentials.apiKey, credentials.apiSecret);

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
