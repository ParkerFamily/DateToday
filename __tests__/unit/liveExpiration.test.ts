import {
  clampLiveExpiration,
  isLiveSessionActive,
  maxLiveExpiresAt,
} from '@/utils/time';

describe('live expiration', () => {
  const started = new Date('2026-09-07T18:00:00');

  it('caps live sessions at 12 hours', () => {
    const tooLong = new Date(started.getTime() + 15 * 60 * 60 * 1000);
    const clamped = clampLiveExpiration(tooLong, started);
    expect(clamped.getTime()).toBe(maxLiveExpiresAt(started).getTime());
  });

  it('rejects expiration before start', () => {
    expect(() => clampLiveExpiration(new Date(started.getTime() - 1000), started)).toThrow();
  });

  it('treats only active non-ended non-expired sessions as live', () => {
    const future = new Date(started.getTime() + 2 * 60 * 60 * 1000).toISOString();
    expect(
      isLiveSessionActive(
        { status: 'active', expiresAt: future, endedAt: null },
        started,
      ),
    ).toBe(true);

    expect(
      isLiveSessionActive(
        { status: 'expired', expiresAt: future, endedAt: null },
        started,
      ),
    ).toBe(false);

    expect(
      isLiveSessionActive(
        {
          status: 'active',
          expiresAt: new Date(started.getTime() - 1000).toISOString(),
          endedAt: null,
        },
        started,
      ),
    ).toBe(false);
  });
});
