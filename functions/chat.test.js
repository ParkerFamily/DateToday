const test = require('node:test');
const assert = require('node:assert/strict');
const chat = require('./chat');

test('parseGifs keeps valid ids with the 200px rendition size, de-duped', () => {
  const gif = (id, w = '200', h = '150') => ({ id, images: { fixed_width: { width: w, height: h } } });
  const out = chat.parseGifs({ data: [gif('abc123XYZ'), gif('abc123XYZ'), gif('bad/id'), gif('ok1234', '0'), gif('Zz9876', '200', '113')] });
  assert.deepEqual(out, [
    { id: 'abc123XYZ', w: 200, h: 150 },
    { id: 'Zz9876', w: 200, h: 113 },
  ]);
  assert.deepEqual(chat.parseGifs(null), []);
});

test('query and offset are cleaned; trending vs search URL; rating stays pg-13', () => {
  assert.equal(chat.cleanQuery('  happy   dance  '), 'happy dance');
  assert.equal(chat.cleanQuery(42), '');
  assert.equal(chat.cleanQuery('x'.repeat(80)).length, 50);
  assert.equal(chat.cleanOffset(30), 24);
  assert.equal(chat.cleanOffset(-5), 0);
  assert.equal(chat.cleanOffset(99999), 240);
  const trending = new URL(chat.giphyUrl('k', '', 0));
  assert.equal(trending.pathname, '/v1/gifs/trending');
  assert.equal(trending.searchParams.get('rating'), 'pg-13');
  assert.equal(trending.searchParams.has('q'), false);
  const search = new URL(chat.giphyUrl('k', 'hi', 24));
  assert.equal(search.pathname, '/v1/gifs/search');
  assert.equal(search.searchParams.get('q'), 'hi');
  assert.equal(search.searchParams.get('offset'), '24');
  assert.equal(chat.cacheKey('Hi', 0), chat.cacheKey('hi', 0));
  assert.notEqual(chat.cacheKey('', 0), chat.cacheKey('', 24));
});

test('reactionAdded: only a new reaction from the other person counts', () => {
  const msg = (reactions) => ({ senderId: 'a', type: 'text', text: 'hey', reactions });
  assert.deepEqual(chat.reactionAdded(msg(undefined), msg({ b: '❤️' })), { uid: 'b', emoji: '❤️' });
  assert.equal(chat.reactionAdded(msg({ b: '❤️' }), msg({ b: '😂' })), null, 'changing an emoji is not a new push');
  assert.equal(chat.reactionAdded(msg({ b: '❤️' }), msg({})), null, 'removing is silent');
  assert.equal(chat.reactionAdded(msg({}), msg({ a: '❤️' })), null, 'sender reacting to self');
  assert.equal(chat.reactionAdded(msg({}), msg({ b: '💩' })), null, 'unknown emoji');
});

test('previews and reaction push copy', () => {
  const summary = () => 'Drinks · Tonight';
  assert.equal(chat.messagePreview({ type: 'gif', gif: { id: 'x' } }, summary), 'Sent a GIF');
  assert.equal(chat.messagePreview({ type: 'text', text: 'hi' }, summary), 'hi');
  assert.equal(chat.messagePreview({ type: 'date_proposal', proposal: {} }, summary), 'Date idea: Drinks · Tonight');
  assert.deepEqual(chat.reactionPush('Sam', '❤️', { type: 'text', text: 'see you  at 8' }), {
    title: 'Sam liked your message',
    body: '“see you at 8”',
  });
  assert.deepEqual(chat.reactionPush('Sam', '😂', { type: 'gif' }), { title: 'Sam reacted 😂', body: 'to your GIF' });
});
