import {
  availableSlots,
  formatTime,
  suggestedTimes,
  weekendDate,
  whenLabel,
  whenSentence,
} from '@/features/plan/when';

// Sunday, Sep 27 2026
const at = (h: number, m = 0) => new Date(2026, 8, 27, h, m);
const today = new Date(2026, 8, 27);
const tomorrow = new Date(2026, 8, 28);

describe('plan times', () => {
  it('suggests the classic times for the date type', () => {
    expect(suggestedTimes('drinks', today, at(12)).map(formatTime)).toEqual(['7:30 PM', '8:30 PM', '9:30 PM']);
    expect(suggestedTimes('coffee', tomorrow, at(12)).map(formatTime)).toEqual(['10:00 AM', '12:00 PM', '3:00 PM']);
  });

  it('only offers times at least 30 minutes out tonight, topped up with later slots', () => {
    expect(suggestedTimes('drinks', today, at(21, 10)).map(formatTime)).toEqual(['10:00 PM', '10:30 PM', '11:00 PM']);
    expect(availableSlots(today, at(23, 10))).toEqual([]);
  });

  it('labels the day naturally', () => {
    expect(whenLabel(today, 20 * 60 + 30, at(12))).toBe('Tonight · 8:30 PM');
    expect(whenSentence(today, 15 * 60, at(9))).toBe('Today at 3:00 PM');
    expect(whenSentence(tomorrow, 19 * 60 + 30, at(12))).toBe('Tomorrow at 7:30 PM');
  });

  it('weekend means the upcoming Saturday, or Sunday when it is already Saturday', () => {
    expect(weekendDate(at(12)).getDate()).toBe(3); // Sun Sep 27 → Sat Oct 3
    expect(weekendDate(new Date(2026, 9, 3, 12)).getDate()).toBe(4); // Sat → Sun
  });
});
