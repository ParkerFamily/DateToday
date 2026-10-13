import { likesMeter } from '@/features/matches/likesMeter';

describe('free Likes meter', () => {
  it('shows Unlimited Likes for DateToday+, whatever the count', () => {
    expect(likesMeter(null, true)).toMatchObject({ tone: 'plus', label: 'Unlimited Likes' });
    expect(likesMeter(0, true)?.tone).toBe('plus');
  });

  it('hides while loading or when the cap is off', () => {
    expect(likesMeter(null, false)).toBeNull();
    expect(likesMeter(undefined, false)).toBeNull();
  });

  it('gets louder as Likes run down', () => {
    expect(likesMeter(15, false)).toMatchObject({ tone: 'calm', label: '15 free Likes left' });
    expect(likesMeter(10, false)?.tone).toBe('calm');
    expect(likesMeter(9, false)).toMatchObject({ tone: 'notice', label: '9 free Likes left' });
    expect(likesMeter(4, false)?.tone).toBe('notice');
    expect(likesMeter(3, false)).toMatchObject({ tone: 'low', label: 'Almost out · 3 Likes left' });
    expect(likesMeter(1, false)).toMatchObject({ tone: 'low', label: 'Almost out · 1 Like left' });
    expect(likesMeter(0, false)).toMatchObject({ tone: 'out', label: 'Out of free Likes · Upgrade' });
    expect(likesMeter(-2, false)?.tone).toBe('out');
  });
});
