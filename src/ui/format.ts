// Numbers as the player reads them. Money and prices come in as cents.

import { calendar, formatTime } from '../sim';

export function money(cents: number, signed = false): string {
  // Whole cents first: a float's dust after the split once printed as "$25.100".
  const whole = Math.round(cents);
  const sign = whole < 0 ? '-' : signed && whole > 0 ? '+' : '';
  const abs = Math.abs(whole);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}$${dollars.toLocaleString('en-US')}.${String(rest).padStart(2, '0')}`;
}

export function moneyShort(cents: number, signed = false): string {
  const sign = cents < 0 ? '-' : signed && cents > 0 ? '+' : '';
  const abs = Math.abs(cents) / 100;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  return money(cents, signed);
}

/**
 * A price in its points, written to the instrument's places: cents for a stock (two), pips for a pair (four or two),
 * and never fewer than two, so gold's ten-cent points read as dollars and cents ("2400.10"). Ungrouped, as the
 * tables' columns are narrow; `dollarPrice` writes one as money, "$2,400.10".
 */
export function price(points: number | null, decimals = 2): string {
  if (points === null) return '—';
  return (points / 10 ** decimals).toFixed(Math.max(2, decimals));
}

/** A dollar price in its points as money: gold's 24001 at one place is "$2,400.10". */
export function dollarPrice(points: number, decimals = 2): string {
  return money(pointsInCents(points, decimals));
}

/** A dollar price's points in cents: a stock's point is a cent, gold's ten. */
export function pointsInCents(points: number, decimals = 2): number {
  return points * 10 ** (2 - decimals);
}

/** What the player typed as a price, in the instrument's points: "1.0851" at four places is 10851. */
export function pointsFrom(text: string, decimals = 2): number {
  return Math.round(Number(text) * 10 ** decimals);
}

/** The smallest step a price box takes at so many places: 0.01, or 0.0001 for the euro in dollars. */
export function priceStep(decimals = 2): number {
  return 1 / 10 ** decimals;
}

/** A change of price in points, signed, to the instrument's places, rounded to a whole point first: never "-0.00". */
export function priceDelta(points: number, decimals = 2): string {
  const whole = Math.round(points) || 0;
  return `${whole >= 0 ? '+' : ''}${price(whole, decimals)}`;
}

/** A balance in a currency's minor units, by its code: "EUR 1,234.56", "JPY -50,000". */
export function balance(amount: number, minor: number, code: string): string {
  const places = Math.max(0, Math.round(Math.log10(minor)));
  const whole = amount / minor;
  return `${code} ${whole.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places })}`;
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

/** When a contract expires, as the top bar writes a time: "Fri wk 1 16:00". */
export function expiryLabel(at: number): string {
  const c = calendar(at);
  return `${c.weekday} wk ${c.week} ${formatTime(at).slice(0, 5)}`;
}
