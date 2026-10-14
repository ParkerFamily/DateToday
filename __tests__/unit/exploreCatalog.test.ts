import { eventRange, eventWhenLabel, plannableEvents } from '@/features/explore/catalog';
import { inRoom, joinRoom, planStartFor, roomLive, sharedRoom, visibleRooms } from '@/features/explore/rooms';

describe('Explore Tonight rooms', () => {
  it('hides Drinks and After Hours in Friend Date under 21 (and when age is unknown)', () => {
    const ids = (mode: 'dating' | 'friend', age: number | null) => visibleRooms(mode, age).map((r) => r.id);
    expect(ids('friend', 19)).not.toContain('drinks');
    expect(ids('friend', 19)).not.toContain('late');
    expect(ids('friend', null)).not.toContain('drinks');
    expect(ids('friend', 25)).toContain('drinks');
    expect(ids('dating', 19)).toContain('drinks');
    expect(ids('dating', 30)).toHaveLength(8);
  });

  it('puts people in a room by what they are Live for', () => {
    expect(inRoom({ activities: ['dinner', 'drinks'] }, 'foodie')).toBe(true);
    expect(inRoom({ activities: ['drinks'] }, 'foodie')).toBe(false);
    expect(inRoom({ activities: ['movie'] }, 'movies')).toBe(true);
    expect(inRoom({ activities: ['surprise'] }, 'spontaneous')).toBe(true);
    expect(inRoom({ activities: ['drinks'], afterHours: [] }, 'late')).toBe(false);
    expect(inRoom({ activities: ['drinks'], afterHours: ['late_meet'] }, 'late')).toBe(true);
    expect(inRoom({ activities: null }, 'coffee')).toBe(false);
  });

  it('builds the Live plan for a room', () => {
    expect(roomLive('foodie', { cuisine: 'sushi' })).toEqual({ activities: ['dinner'], foodCuisines: ['sushi'], afterHours: [] });
    expect(roomLive('foodie').foodCuisines).toEqual(['anything']);
    expect(roomLive('events')).toEqual({ activities: ['event'], foodCuisines: [], afterHours: [] });
    expect(roomLive('late', { late: 'dinner' })).toEqual({
      activities: ['dinner'],
      foodCuisines: ['anything'],
      afterHours: ['late_meet'],
    });
    expect(roomLive('late').activities).toEqual(['surprise']);
  });

  it('joining a room adds to tonight’s plan without dropping anything', () => {
    const now = { activities: ['drinks' as const], foodCuisines: [], afterHours: [] };
    expect(joinRoom(now, 'movies')).toEqual({ activities: ['drinks', 'movie'], foodCuisines: [], afterHours: [] });
    const eating = { activities: ['dinner' as const], foodCuisines: ['anything' as const], afterHours: [] };
    expect(joinRoom(eating, 'foodie', { cuisine: 'italian' }).foodCuisines).toEqual(['italian']);
    expect(joinRoom(now, 'late').afterHours).toEqual(['late_meet']);
  });

  it('picks the room a match is about', () => {
    expect(sharedRoom('movies', { activities: ['dinner'] }, { activities: ['movie'] })).toBe('movies');
    expect(sharedRoom('movies', { activities: ['dinner', 'event'] }, { activities: ['event'] })).toBe('events');
    expect(sharedRoom(null, { activities: ['coffee'] }, { activities: ['drinks'] })).toBeNull();
    expect(sharedRoom('late', { activities: [] }, { activities: ['drinks'], afterHours: ['late_meet'] })).toBe('late');
  });

  it('opens the plan sheet on the room’s kind of date', () => {
    expect(planStartFor('foodie')).toEqual({ category: 'dinner', pick: 'spot' });
    expect(planStartFor('movies')).toEqual({ category: 'activity', pick: 'movie' });
    expect(planStartFor('events')).toEqual({ category: 'activity', pick: 'event' });
    expect(planStartFor('late')?.category).toBe('drinks');
    expect(planStartFor('spontaneous')).toBeNull();
    expect(planStartFor(null)).toBeNull();
  });
});

describe('Explore events', () => {
  it('labels event times in the venue’s time without inventing a time', () => {
    const now = new Date(2026, 9, 13, 15, 0);
    expect(eventWhenLabel({ localDate: '2026-10-13', localTime: '19:30' }, now)).toBe('Tonight · 7:30 PM');
    expect(eventWhenLabel({ localDate: '2026-10-13', localTime: '13:00' }, now)).toBe('Today · 1 PM');
    expect(eventWhenLabel({ localDate: '2026-10-14', localTime: '20:00' }, now)).toBe('Tomorrow · 8 PM');
    expect(eventWhenLabel({ localDate: '2026-10-13', localTime: null }, now)).toBe('Tonight · Time TBA');
  });

  it('tonight runs until 4 AM, coming up is two weeks', () => {
    const evening = new Date(2026, 9, 13, 20, 0);
    expect(new Date(eventRange('tonight', evening).endMs)).toEqual(new Date(2026, 9, 14, 4, 0));
    const lateNight = new Date(2026, 9, 14, 1, 0);
    expect(new Date(eventRange('tonight', lateNight).endMs)).toEqual(new Date(2026, 9, 14, 4, 0));
    expect(eventRange('soon', evening).endMs - evening.getTime()).toBe(14 * 86400000);
  });

  it('drops started events and repeat time slots of the same show', () => {
    const now = new Date('2026-10-14T16:00:00Z');
    const ev = (name: string, venueName: string | null, startsAt: string | null) => ({ name, venueName, startsAt });
    const out = plannableEvents(
      [
        ev('Museum', 'Hall', '2026-10-14T15:30:00Z'),
        ev('Museum', 'Hall', '2026-10-14T16:15:00Z'),
        ev('Museum', 'Hall', '2026-10-14T16:30:00Z'),
        ev('Hamilton', 'Rodgers', '2026-10-14T23:00:00Z'),
        ev('Hamilton', 'Other', '2026-10-14T23:00:00Z'),
        ev('Open mic', null, null),
      ],
      now,
    );
    expect(out.map((e) => `${e.name}@${e.startsAt}`)).toEqual([
      'Museum@2026-10-14T16:15:00Z',
      'Hamilton@2026-10-14T23:00:00Z',
      'Hamilton@2026-10-14T23:00:00Z',
      'Open mic@null',
    ]);
  });
});
