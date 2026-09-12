import { formatPingClock } from '@/lib/usage/dailyLimits';

describe('formatPingClock', () => {
  it('formats under one hour as MM:SS', () => {
    expect(formatPingClock(24 * 60_000 + 17_000)).toBe('24:17');
    expect(formatPingClock(5 * 60_000)).toBe('05:00');
  });

  it('formats over one hour as HH:MM:SS', () => {
    expect(formatPingClock(3661_000)).toBe('01:01:01');
  });
});
