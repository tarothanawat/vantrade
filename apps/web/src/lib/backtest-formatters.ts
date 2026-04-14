export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function formatWinRate(winCount: number, lossCount: number): string {
  if (winCount + lossCount === 0) return 'N/A';
  return `${((winCount / (winCount + lossCount)) * 100).toFixed(1)}%`;
}

export function formatBarTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}
