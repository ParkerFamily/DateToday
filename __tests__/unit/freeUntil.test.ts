import {
  freeUntilOptions,
  isStaleLive,
  needsReconfirm,
  pickFreeUntil,
} from '@/features/live/freeUntil';

const at = (h: number, m = 0, day = 26) => new Date(2026, 8, day, h, m);
const values = (now: Date, start: number | null = null) => freeUntilOptions(now, start).map((o) => o.value);

describe('freeUntilOptions', () => {
  it('offers the end times still ahead tonight', () => {
    expect(values(at(19))).toEqual(['21', '22', '23', 'late']);
    expect(values(at(21, 45))).toEqual(['23', 'late']);
  });

  it('treats after midnight as the same night', () => {
    const opts = freeUntilOptions(at(0, 30, 27));
    expect(opts.map((o) => o.value)).toEqual(['late']);
    expect(opts[0].expiresAt.getHours()).toBe(2);
  });

  it('falls back to a short window when the night is over', () => {
    const opts = freeUntilOptions(at(1, 45, 27));
    expect(opts).toHaveLength(1);
    expect(opts[0].expiresAt.getTime()).toBe(at(3, 45, 27).getTime());
  });

  it('never ends before a free-later start', () => {
    expect(values(at(17), 21)).toEqual(['22', '23', 'late']);
  });

  it('defaults to 11 PM when available', () => {
    expect(pickFreeUntil(freeUntilOptions(at(19)), null).value).toBe('23');
    expect(pickFreeUntil(freeUntilOptions(at(19)), '21').value).toBe('21');
  });
});

describe('reconfirm', () => {
  const session = { startedAt: at(18).toISOString(), confirmedAt: null, expiresAt: at(26).toISOString() };

  it('asks after three hours and goes stale after four', () => {
    expect(needsReconfirm(session, at(20, 59))).toBe(false);
    expect(needsReconfirm(session, at(21))).toBe(true);
    expect(isStaleLive(session, at(21, 59))).toBe(false);
    expect(isStaleLive(session, at(22))).toBe(true);
  });

  it('restarts the clock on "keep me live"', () => {
    const kept = { ...session, confirmedAt: at(21).toISOString() };
    expect(needsReconfirm(kept, at(22))).toBe(false);
    expect(isStaleLive(kept, at(23))).toBe(false);
  });

  it('does not ask when the session is about to end anyway', () => {
    expect(needsReconfirm({ ...session, expiresAt: at(21, 10).toISOString() }, at(21))).toBe(false);
  });
});
