import { balance, money, moneyShort, ms, pointsFrom, price, priceDelta, priceStep } from '../src/ui/format';

describe('format', () => {
  it('prints money from cents, floats included', () => {
    expect(money(2510)).toBe('$25.10');
    expect(money(-2510.0000001)).toBe('-$25.10');
    expect(money(-2509.9999999)).toBe('-$25.10');
    expect(money(123456789, true)).toBe('+$1,234,567.89');
    expect(money(0)).toBe('$0.00');
    expect(moneyShort(20_000_000)).toBe('$200.0k');
    expect(moneyShort(150_000_000)).toBe('$1.50M');
  });

  it("prints a price to its instrument's places, and reads one typed back into points", () => {
    expect(price(10850, 4)).toBe('1.0850');
    expect(price(15000, 2)).toBe('150.00');
    expect(priceDelta(-12, 4)).toBe('-0.0012');
    expect(priceDelta(37)).toBe('+0.37');
    expect(priceDelta(-0.3)).toBe('+0.00');
    expect(priceDelta(-0.6, 4)).toBe('-0.0001');
    expect(pointsFrom('1.0851', 4)).toBe(10851);
    expect(pointsFrom('41.02')).toBe(4102);
    expect(priceStep(4)).toBe(0.0001);
    expect(balance(123_456, 100, 'EUR')).toBe('EUR 1,234.56');
    expect(balance(-50_000, 1, 'JPY')).toBe('JPY -50,000');
  });

  it('prints prices and latencies', () => {
    expect(price(4102)).toBe('41.02');
    expect(price(null)).toBe('—');
    expect(ms(0.555)).toBe('555µs');
    expect(ms(44)).toBe('44ms');
    expect(ms(8.5)).toBe('8.5ms');
  });
});
