export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function toCryptoSlashSymbol(symbol: string): string | null {
  const normalized = normalizeSymbol(symbol);
  if (normalized.includes('/')) return null;

  if (normalized.endsWith('USDT') && normalized.length > 4) {
    return `${normalized.slice(0, -4)}/USDT`;
  }

  if (normalized.endsWith('USD') && normalized.length > 3) {
    return `${normalized.slice(0, -3)}/USD`;
  }

  return null;
}

export function isCryptoLikeSymbol(symbol: string): boolean {
  const normalized = normalizeSymbol(symbol);
  return (
    normalized.includes('/') ||
    normalized.endsWith('USD') ||
    normalized.endsWith('USDT')
  );
}

/**
 * For equities: returns the raw symbol plus a slash variant if it looks crypto-like
 * (handles edge cases where a stock symbol collides with a crypto pattern).
 */
export function getStockSymbolCandidates(symbol: string): string[] {
  const normalized = normalizeSymbol(symbol);
  const slashVariant = toCryptoSlashSymbol(normalized);
  if (!slashVariant) return [normalized];
  return [normalized, slashVariant];
}

/**
 * For crypto: slash form is preferred first (e.g. BTC/USD before BTCUSD),
 * then the raw form, deduped.
 */
export function getCryptoSymbolCandidates(symbol: string): string[] {
  const normalized = normalizeSymbol(symbol);
  const slash = toCryptoSlashSymbol(normalized);
  const ordered = [slash ?? normalized, normalized, slash].filter(
    (value): value is string => Boolean(value),
  );
  return [...new Set(ordered)];
}
