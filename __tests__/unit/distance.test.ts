import { formatDistanceMiles } from '@/utils/time';

describe('formatDistanceMiles', () => {
  it('never claims more precision than the ~0.5 mi stored location', () => {
    expect(formatDistanceMiles(0)).toBe('Under 1 mi');
    expect(formatDistanceMiles(0.6)).toBe('Under 1 mi');
    expect(formatDistanceMiles(1.4)).toBe('1 mi');
    expect(formatDistanceMiles(7.99)).toBe('8 mi');
    expect(formatDistanceMiles(12.5)).toBe('13 mi');
  });
});
