export enum Role {
  PROVIDER = 'PROVIDER',
  TESTER = 'TESTER',
  ADMIN = 'ADMIN',
}

export enum OrderSide {
  BUY = 'buy',
  SELL = 'sell',
}

export enum TradeSignal {
  BUY = 'buy',
  SELL = 'sell',
  HOLD = 'hold',
}

export enum OrderStatus {
  FILLED = 'filled',
  PARTIALLY_FILLED = 'partially_filled',
  PENDING = 'pending',
  CANCELLED = 'cancelled',
  REJECTED = 'rejected',
}
