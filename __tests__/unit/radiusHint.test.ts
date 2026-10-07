import { radiusHint } from '@/constants/flow';

describe('radiusHint', () => {
  it('never says "a few" when nobody matches', () => {
    expect(radiusHint(0, 10, 15)).toBe('No matches within 10 mi yet. Try 15 mi.');
  });

  it('says "a few" for 1–3', () => {
    expect(radiusHint(1, 10, 15)).toBe('Only a few matches within 10 mi. Try 15 mi.');
    expect(radiusHint(3, 10, 15)).toBe('Only a few matches within 10 mi. Try 15 mi.');
  });

  it('stays quiet once there are plenty', () => {
    expect(radiusHint(4, 10, 15)).toBeNull();
  });

  it('drops the suggestion at the plan max', () => {
    expect(radiusHint(0, 25, null)).toBe('No matches within 25 mi yet.');
    expect(radiusHint(0, 50, 50)).toBe('No matches within 50 mi yet.');
  });
});
