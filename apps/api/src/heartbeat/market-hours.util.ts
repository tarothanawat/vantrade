import type { MarketDataTimeframe } from '@vantrade/types';

// Configurable via MARKET_TIMEZONE env var; defaults to US Eastern time.
// Example: MARKET_TIMEZONE=Europe/London for LSE-listed instruments.
const US_MARKET_TIMEZONE = process.env.MARKET_TIMEZONE ?? 'America/New_York';

export function getEasternTimeParts(now: Date = new Date()): {
  weekday: string;
  hour: number;
  minute: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: US_MARKET_TIMEZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    weekday: getPart('weekday'),
    hour: Number(getPart('hour')),
    minute: Number(getPart('minute')),
  };
}

export function isUsMarketOpen(now: Date = new Date()): boolean {
  const { weekday, hour, minute } = getEasternTimeParts(now);
  if (weekday === 'Sat' || weekday === 'Sun') return false;

  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight >= 9 * 60 + 30 && minutesSinceMidnight < 16 * 60;
}

export function isTwentyFourSevenSymbol(symbol: string): boolean {
  const normalized = symbol.trim().toUpperCase();
  return normalized.endsWith('USD') || normalized.endsWith('USDT');
}

export function isMarketOpenForSymbol(symbol: string, now: Date = new Date()): boolean {
  if (isTwentyFourSevenSymbol(symbol)) return true;
  return isUsMarketOpen(now);
}

export function shouldRunForTimeframe(
  timeframe: MarketDataTimeframe,
  now: Date = new Date(),
): boolean {
  const { hour, minute } = getEasternTimeParts(now);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return false;

  switch (timeframe) {
    case '1Min':
      return true;
    case '5Min':
      return minute % 5 === 0;
    case '15Min':
      return minute % 15 === 0;
    case '1Hour':
      return minute === 0;
    case '1Day':
      return hour === 0 && minute === 0;
    default:
      return true;
  }
}
