import {
  eventKind,
  eventRange,
  eventWhenLabel,
  hoursLine,
  planShape,
  priceLabel,
  visibleCategories,
} from '@/features/explore/catalog';

describe('Explore catalog', () => {
  it('hides Drinks and After Hours in Friend Date under 21 (and when age is unknown)', () => {
    const values = (mode: 'dating' | 'friend', age: number | null) => visibleCategories(mode, age).map((c) => c.value);
    expect(values('friend', 19)).not.toContain('drinks');
    expect(values('friend', 19)).not.toContain('late');
    expect(values('friend', null)).not.toContain('drinks');
    expect(values('friend', 25)).toContain('drinks');
    expect(values('dating', 19)).toContain('drinks');
    expect(values('dating', 30)).toHaveLength(7);
  });

  it('maps picks onto the existing plan types', () => {
    expect(planShape('foodie', { style: 'steak' })).toMatchObject({ plan: 'dinner', activity: 'dinner', cuisine: 'steakhouse' });
    expect(planShape('foodie', { style: 'brunch' }).cuisine).toBeNull();
    expect(planShape('movies')).toMatchObject({ plan: 'activity', label: '🎬 Movie' });
    expect(planShape('events').plan).toBe('activity');
    expect(planShape('late', { kind: 'Night club' }).plan).toBe('drinks');
    expect(planShape('late', { kind: 'Diner' }).plan).toBe('dinner');
    expect(planShape('coffee').activity).toBe('coffee');
  });

  it('labels event times in the venue’s time without inventing a time', () => {
    const now = new Date(2026, 9, 13, 15, 0);
    expect(eventWhenLabel({ localDate: '2026-10-13', localTime: '19:30' }, now)).toBe('Tonight · 7:30 PM');
    expect(eventWhenLabel({ localDate: '2026-10-13', localTime: '13:00' }, now)).toBe('Today · 1 PM');
    expect(eventWhenLabel({ localDate: '2026-10-14', localTime: '20:00' }, now)).toBe('Tomorrow · 8 PM');
    expect(eventWhenLabel({ localDate: '2026-10-13', localTime: null }, now)).toBe('Tonight · Time TBA');
  });

  it('groups events for the filter chips', () => {
    expect(eventKind({ segment: 'Arts & Theatre', genre: 'Comedy' })).toBe('comedy');
    expect(eventKind({ segment: 'Music', genre: 'Rock' })).toBe('music');
    expect(eventKind({ segment: null, genre: null })).toBe('other');
  });

  it('tonight runs until 4 AM, coming up is two weeks', () => {
    const evening = new Date(2026, 9, 13, 20, 0);
    expect(new Date(eventRange('tonight', evening).endMs)).toEqual(new Date(2026, 9, 14, 4, 0));
    const lateNight = new Date(2026, 9, 14, 1, 0);
    expect(new Date(eventRange('tonight', lateNight).endMs)).toEqual(new Date(2026, 9, 14, 4, 0));
    expect(eventRange('soon', evening).endMs - evening.getTime()).toBe(14 * 86400000);
  });

  it('only shows hours the provider gave', () => {
    expect(hoursLine({ openNow: null, closesAt: null, open24h: false })).toBeNull();
    expect(hoursLine({ openNow: true, closesAt: 120, open24h: false })?.text).toBe('Open until 2 AM');
    expect(hoursLine({ openNow: true, closesAt: 0, open24h: false })?.text).toBe('Open until midnight');
    expect(hoursLine({ openNow: false, closesAt: null, open24h: false })).toEqual({ text: 'Closed now', open: false });
    expect(hoursLine({ openNow: true, closesAt: null, open24h: true })?.text).toBe('Open 24 hours');
  });

  it('formats price levels', () => {
    expect(priceLabel(null)).toBeNull();
    expect(priceLabel(0)).toBe('Free');
    expect(priceLabel(3)).toBe('$$$');
  });
});
