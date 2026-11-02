// Numbers as the player reads them. Money and prices come in as cents.

export function money(cents: number, signed = false): string {
  const sign = cents < 0 ? '-' : signed && cents > 0 ? '+' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = Math.round(abs % 100);
  return `${sign}$${dollars.toLocaleString('en-US')}.${String(rest).padStart(2, '0')}`;
}

export function moneyShort(cents: number, signed = false): string {
  const sign = cents < 0 ? '-' : signed && cents > 0 ? '+' : '';
  const abs = Math.abs(cents) / 100;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  return money(cents, signed);
}

export function price(cents: number | null): string {
  if (cents === null) return '—';
  return (cents / 100).toFixed(2);
}

export function centsDelta(cents: number): string {
  const sign = cents < 0 ? '-' : '+';
  return `${sign}${Math.abs(cents).toFixed(cents % 1 === 0 ? 0 : 2)}¢`;
}

export function ms(value: number): string {
  if (value < 1) return `${(value * 1000).toFixed(0)}µs`;
  return `${value % 1 === 0 ? value : value.toFixed(1)}ms`;
}

export function shares(n: number): string {
  return n.toLocaleString('en-US');
}
