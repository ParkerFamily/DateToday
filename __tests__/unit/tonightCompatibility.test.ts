import { tonightCompatibility, sharedFoodHeadline } from '@/utils/tonightCompatibility';

describe('tonightCompatibility', () => {
  it('builds dinner + cuisine cue', () => {
    const result = tonightCompatibility(
      { activities: ['drinks', 'dinner'], foodCuisines: ['italian', 'sushi'] },
      { activities: ['dinner'], foodCuisines: ['italian'] },
    );
    expect(result.sharedActivities).toContain('dinner');
    expect(result.sharedFood[0]).toBe('italian');
    expect(result.cue).toContain('Dinner');
    expect(result.cue).toContain('Italian');
    expect(result.score).toBeGreaterThan(10);
  });

  it('ranks overlapping vibes above no overlap', () => {
    const me = { activities: ['drinks' as const], foodCuisines: [] };
    const a = tonightCompatibility(me, { activities: ['drinks'], foodCuisines: [] });
    const b = tonightCompatibility(me, { activities: ['coffee'], foodCuisines: [] });
    expect(a.score).toBeGreaterThan(b.score);
  });

  it('formats shared food headline', () => {
    expect(sharedFoodHeadline(['sushi'])).toContain('SUSHI');
  });
});
