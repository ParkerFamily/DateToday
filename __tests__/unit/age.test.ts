import { calculateAge, isAtLeast18, parseDateOnly } from '@/utils/time';

describe('age helpers', () => {
  const now = new Date(2026, 8, 7); // Sep 7, 2026

  it('calculates age from YYYY-MM-DD without UTC shift', () => {
    expect(calculateAge('2000-09-07', now)).toBe(26);
    expect(calculateAge('2000-09-08', now)).toBe(25);
  });

  it('requires 18+', () => {
    expect(isAtLeast18('2008-09-07', now)).toBe(true);
    expect(isAtLeast18('2008-09-08', now)).toBe(false);
  });

  it('parses date-only as local calendar date', () => {
    const d = parseDateOnly('1995-01-15');
    expect(d.getFullYear()).toBe(1995);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
  });
});
