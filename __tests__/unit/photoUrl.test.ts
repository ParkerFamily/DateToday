import { repairStorageUrl } from '@/utils/photoUrl';

const good =
  'https://firebasestorage.googleapis.com/v0/b/datetoday-e1331.firebasestorage.app/o/users%2Fabc%2Fphotos%2Fmain.jpg?alt=media&token=123';

describe('repairStorageUrl', () => {
  it('leaves a correct link alone', () => {
    expect(repairStorageUrl(good)).toBe(good);
  });

  it('re-encodes a link whose path was decoded by navigation', () => {
    const broken = good.replace(/%2F/g, '/');
    expect(repairStorageUrl(broken)).toBe(good);
  });

  it('ignores other links and empty values', () => {
    expect(repairStorageUrl('https://example.com/a/b.jpg?x=1')).toBe('https://example.com/a/b.jpg?x=1');
    expect(repairStorageUrl('')).toBeNull();
    expect(repairStorageUrl(null)).toBeNull();
  });
});
