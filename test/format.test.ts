import { money, moneyShort, ms, price } from '../src/ui/format';

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

  it('prints prices and latencies', () => {
    expect(price(4102)).toBe('41.02');
    expect(price(null)).toBe('—');
    expect(ms(0.555)).toBe('555µs');
    expect(ms(44)).toBe('44ms');
    expect(ms(8.5)).toBe('8.5ms');
  });
});
