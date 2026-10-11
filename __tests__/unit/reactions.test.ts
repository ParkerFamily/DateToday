import { isMessageReaction, MESSAGE_REACTIONS, parseReactions, reactionsKey } from '@/features/matches/reactions';

const serverReactions: string[] = require('../../functions/chat').REACTIONS;

describe('message reactions', () => {
  it('matches the server list and the Firestore rules exactly', () => {
    expect([...MESSAGE_REACTIONS]).toEqual(serverReactions);
    const rules: string = require('fs').readFileSync(require('path').join(__dirname, '../../firestore.rules'), 'utf8');
    const listed = rules.match(/reactions\[request\.auth\.uid\] in \[([^\]]+)\]/);
    expect(listed).not.toBeNull();
    expect(listed![1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))).toEqual([...MESSAGE_REACTIONS]);
  });

  it('keeps only known emoji', () => {
    expect(parseReactions({ a: '❤️', b: '💩', c: 3 })).toEqual({ a: '❤️' });
    expect(parseReactions({ b: 'nope' })).toBeUndefined();
    expect(parseReactions(null)).toBeUndefined();
    expect(isMessageReaction('🔥')).toBe(true);
    expect(isMessageReaction('❤')).toBe(false);
  });

  it('reactionsKey is order-independent and changes with the emoji', () => {
    expect(reactionsKey({ b: '😂', a: '❤️' })).toBe(reactionsKey({ a: '❤️', b: '😂' }));
    expect(reactionsKey({ a: '❤️' })).not.toBe(reactionsKey({ a: '😂' }));
    expect(reactionsKey(undefined)).toBe('');
  });
});
