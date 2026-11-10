import {
  MARKET_CLOSE,
  MARKET_OPEN,
  MS_PER_DAY,
  MS_PER_HOUR,
  activity,
  calendar,
  formatSpan,
  formatTime,
  isMarketOpen,
  nextClose,
  nextOpen,
  openMsBetween,
} from '../src/sim/clock';

const monday = 0;
const friday = 4 * MS_PER_DAY;
const saturday = 5 * MS_PER_DAY;

describe('clock', () => {
  it('knows the weekday and the week', () => {
    expect(calendar(monday).weekday).toBe('Mon');
    expect(calendar(friday).weekday).toBe('Fri');
    expect(calendar(saturday).weekday).toBe('Sat');
    expect(calendar(7 * MS_PER_DAY).week).toBe(2);
  });

  it('opens at 09:30 and closes at 16:00 on weekdays only', () => {
    expect(isMarketOpen(monday + MARKET_OPEN - 1)).toBe(false);
    expect(isMarketOpen(monday + MARKET_OPEN)).toBe(true);
    expect(isMarketOpen(monday + MARKET_CLOSE - 1)).toBe(true);
    expect(isMarketOpen(monday + MARKET_CLOSE)).toBe(false);
    expect(isMarketOpen(saturday + 12 * MS_PER_HOUR)).toBe(false);
  });

  it('finds the next open across an evening and a weekend', () => {
    expect(nextOpen(monday)).toBe(monday + MARKET_OPEN);
    expect(nextOpen(monday + MARKET_OPEN)).toBe(MS_PER_DAY + MARKET_OPEN);
    expect(nextOpen(friday + MARKET_CLOSE)).toBe(7 * MS_PER_DAY + MARKET_OPEN);
    expect(nextOpen(saturday)).toBe(7 * MS_PER_DAY + MARKET_OPEN);
  });

  it('finds the next close', () => {
    expect(nextClose(monday + MARKET_OPEN)).toBe(monday + MARKET_CLOSE);
    expect(nextClose(monday + MARKET_CLOSE)).toBe(MS_PER_DAY + MARKET_CLOSE);
    expect(nextClose(saturday)).toBe(7 * MS_PER_DAY + MARKET_CLOSE);
  });

  it('is busiest at the open and quiet at lunch, and dead when closed', () => {
    const open = activity(monday + MARKET_OPEN);
    const lunch = activity(monday + 12.75 * MS_PER_HOUR);
    expect(open).toBeGreaterThan(lunch);
    expect(lunch).toBeGreaterThan(0.3);
    expect(activity(saturday + 12 * MS_PER_HOUR)).toBe(0);
  });

  it('formats time and spans', () => {
    expect(formatTime(monday + MARKET_OPEN)).toBe('09:30:00');
    expect(formatSpan(450)).toBe('450ms');
    expect(formatSpan(38_000)).toBe('38s');
    expect(formatSpan(2 * MS_PER_HOUR + 14 * 60_000)).toBe('2h 14m');
    expect(formatSpan(2 * MS_PER_DAY + 3 * MS_PER_HOUR)).toBe('2d 3h');
  });
});

describe('open time between two moments', () => {
  const open = MARKET_CLOSE - MARKET_OPEN;
  it('counts only the stocks hours, on weekdays', () => {
    expect(openMsBetween(0, MS_PER_DAY)).toBe(open);
    expect(openMsBetween(MARKET_OPEN, MARKET_CLOSE)).toBe(open);
    expect(openMsBetween(MARKET_OPEN + 1000, MARKET_OPEN + 3000)).toBe(2000);
    expect(openMsBetween(MARKET_CLOSE, MS_PER_DAY + MARKET_OPEN)).toBe(0);
    // Friday 12:00 to Monday 12:00: the rest of Friday and the morning of Monday.
    const fri = 4 * MS_PER_DAY;
    expect(openMsBetween(fri + 12 * MS_PER_HOUR, 7 * MS_PER_DAY + 12 * MS_PER_HOUR)).toBe(
      MARKET_CLOSE - 12 * MS_PER_HOUR + (12 * MS_PER_HOUR - MARKET_OPEN),
    );
    expect(openMsBetween(5 * MS_PER_DAY, 7 * MS_PER_DAY)).toBe(0);
    expect(openMsBetween(100, 50)).toBe(0);
  });
});
