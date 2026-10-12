'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const contactBlocks = require('./contactBlocks');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Just enough Firestore for contactBlocks.js: paths, merges, array transforms, simple queries. */
function fakeDb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const apply = (prev, data, merge) => {
    const out = merge ? { ...(prev || {}) } : {};
    for (const [k, v] of Object.entries(data)) {
      const name = v && v.methodName;
      if (name === 'FieldValue.arrayUnion') out[k] = [...new Set([...(out[k] || []), ...v.elements])];
      else if (name === 'FieldValue.arrayRemove') out[k] = (out[k] || []).filter((x) => !v.elements.includes(x));
      else if (name === 'FieldValue.serverTimestamp') out[k] = Date.now();
      else out[k] = v;
    }
    return out;
  };
  const snap = (path) => {
    const data = docs.get(path);
    return { id: path.split('/').pop(), ref: docRef(path), exists: data !== undefined, data: () => data, get: (f) => data && data[f] };
  };
  function docRef(path) {
    return {
      path,
      id: path.split('/').pop(),
      collection: (name) => collection(`${path}/${name}`),
      get: async () => snap(path),
      set: async (data, opts) => docs.set(path, apply(docs.get(path), data, opts && opts.merge)),
      delete: async () => docs.delete(path),
    };
  }
  const matches = (path, filters) =>
    [...docs.keys()]
      .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
      .map(snap)
      .filter((s) =>
        filters.every(([f, op, v]) => {
          const x = s.data()[f];
          if (op === '==') return x === v;
          if (op === 'array-contains') return Array.isArray(x) && x.includes(v);
          if (op === 'array-contains-any') return Array.isArray(x) && v.some((y) => x.includes(y));
          throw new Error(`op ${op}`);
        }),
      );
  const query = (path, filters = [], max = Infinity) => ({
    where: (f, op, v) => query(path, [...filters, [f, op, v]], max),
    orderBy: () => query(path, filters, max),
    limit: (n) => query(path, filters, n),
    count: () => ({ get: async () => ({ data: () => ({ count: matches(path, filters).length }) }) }),
    get: async () => {
      const found = matches(path, filters).slice(0, max);
      return { empty: !found.length, size: found.length, docs: found };
    },
  });
  function collection(path) {
    return { ...query(path), doc: (id) => docRef(`${path}/${id}`) };
  }
  const writes = () => {
    const ops = [];
    return {
      set: (ref, data, opts) => ops.push(() => ref.set(data, opts)),
      delete: (ref) => ops.push(() => ref.delete()),
      commit: async () => { for (const op of ops) await op(); },
      close: async () => { for (const op of ops) await op(); },
    };
  };
  return {
    docs,
    collection,
    batch: writes,
    bulkWriter: writes,
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    recursiveDelete: async (ref) => {
      for (const p of [...docs.keys()]) if (p === ref.path || p.startsWith(`${ref.path}/`)) docs.delete(p);
    },
  };
}

const call = (db, uid, body, email = null) =>
  contactBlocks.createContactBlocksEndpoint()(
    { body },
    { db, auth: { getUser: async () => ({ email }) }, decoded: { uid } },
  );
const hidden = (db, uid) => (db.docs.get(`hiddenUsers/${uid}`) || {}).uids || [];

test('contactKey: phones line up across formats; emails reach the same inbox', () => {
  assert.equal(contactBlocks.contactKey('phone', '+1 (555) 123-4567'), 'p:5551234567');
  assert.equal(contactBlocks.contactKey('phone', '555.123.4567'), 'p:5551234567');
  assert.equal(contactBlocks.contactKey('phone', '+44 7911 123456'), contactBlocks.contactKey('phone', '07911 123456'));
  assert.equal(contactBlocks.contactKey('phone', '12345'), null);
  assert.equal(contactBlocks.contactKey('email', ' J.Doe+dating@GoogleMail.com '), 'e:jdoe@gmail.com');
  assert.equal(contactBlocks.contactKey('email', 'not an email'), null);
  assert.equal(contactBlocks.hashOf('phone', '(555) 123-4567'), sha('p:5551234567'));
});

test('cleanEntry: keeps valid hashes, dedupes, labels, and ids by content', () => {
  const h1 = sha('p:5551234567');
  const h2 = sha('e:a@b.co');
  const e = contactBlocks.cleanEntry({ label: '  Mom   Smith ', hashes: [h1, h2, h1, 'nope'] });
  assert.deepEqual(e.hashes, [h1, h2]);
  assert.equal(e.label, 'Mom Smith');
  assert.equal(e.id, contactBlocks.cleanEntry({ hashes: [h2, h1] }).id);
  assert.equal(contactBlocks.cleanEntry({ label: 'x', hashes: ['nope'] }), null);
});

test('blocking a contact hides both people, drops hearts, and releases on remove', async () => {
  const db = fakeDb({
    'contactIdentity/bob': { emailHash: contactBlocks.hashOf('email', 'bob@x.com') },
    [`contactHashes/${contactBlocks.hashOf('email', 'bob@x.com')}`]: { owners: ['bob'] },
    'interests/bob_amy': { fromUid: 'bob' },
  });
  const r = await call(db, 'amy', { action: 'add', entries: [{ label: 'Bob', hashes: [contactBlocks.hashOf('email', 'Bob@X.com')] }] });
  assert.equal(r.added, 1);
  assert.deepEqual(hidden(db, 'amy'), ['bob']);
  assert.deepEqual(hidden(db, 'bob'), ['amy']);
  assert.ok(!db.docs.has('interests/bob_amy'));
  assert.ok(db.docs.has('contactHides/amy_bob'));

  const list = await call(db, 'amy', { action: 'list' }, 'amy@x.com');
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].label, 'Bob');
  assert.ok(!JSON.stringify(list).includes('bob'), 'the list never says who matched');

  await call(db, 'amy', { action: 'remove', ids: [list.entries[0].id] });
  assert.deepEqual(hidden(db, 'amy'), []);
  assert.deepEqual(hidden(db, 'bob'), []);
  assert.ok(!db.docs.has('contactHides/amy_bob'));
});

test('someone who joins or adds their number later is matched', async () => {
  const db = fakeDb();
  await call(db, 'amy', { action: 'add', entries: [{ label: 'Ex', hashes: [contactBlocks.hashOf('phone', '+1 555 123 4567')] }] });
  assert.deepEqual(hidden(db, 'amy'), []);
  await contactBlocks.syncIdentity(db, 'cal', { email: 'cal@x.com' });
  assert.deepEqual(hidden(db, 'amy'), []);
  const r = await call(db, 'cal', { action: 'setPhone', phone: '(555) 123-4567' }, 'cal@x.com');
  assert.equal(r.phoneLast4, '4567');
  assert.deepEqual(hidden(db, 'amy'), ['cal']);
  assert.deepEqual(hidden(db, 'cal'), ['amy']);
  await call(db, 'cal', { action: 'setPhone', phone: null }, 'cal@x.com');
  assert.deepEqual(hidden(db, 'amy'), []);
});

test('removing a contact keeps the pair hidden when a regular block or unmatch still applies', async () => {
  const bobHash = contactBlocks.hashOf('email', 'bob@x.com');
  const db = fakeDb({
    'contactIdentity/bob': { emailHash: bobHash },
    [`contactHashes/${bobHash}`]: { owners: ['bob'] },
    'blocks/bob_amy': { blockerId: 'bob', blockedId: 'amy' },
  });
  await call(db, 'amy', { action: 'add', entries: [{ label: 'Bob', hashes: [bobHash] }] });
  const { entries } = await call(db, 'amy', { action: 'list' }, 'amy@x.com');
  await call(db, 'amy', { action: 'remove', ids: [entries[0].id] });
  assert.deepEqual(hidden(db, 'amy'), ['bob']);
  assert.equal(await contactBlocks.unhideIfFree(db, 'amy', 'bob'), false);
});

test('your own email in the list never hides you from yourself', async () => {
  const mine = contactBlocks.hashOf('email', 'amy@x.com');
  const db = fakeDb();
  await contactBlocks.syncIdentity(db, 'amy', { email: 'amy@x.com' });
  await call(db, 'amy', { action: 'add', entries: [{ label: 'Me', hashes: [mine] }] });
  assert.deepEqual(hidden(db, 'amy'), []);
});

test('purgeUser removes the list, identity and matches', async () => {
  const bobHash = contactBlocks.hashOf('email', 'bob@x.com');
  const db = fakeDb({ 'contactIdentity/bob': { emailHash: bobHash }, [`contactHashes/${bobHash}`]: { owners: ['bob'] } });
  await call(db, 'amy', { action: 'add', entries: [{ label: 'Bob', hashes: [bobHash] }] });
  await contactBlocks.purgeUser(db, 'amy');
  assert.ok(![...db.docs.keys()].some((p) => p.startsWith('contactBlocks/amy') || p.startsWith('contactHides/')));
  assert.deepEqual(db.docs.get(`contactHashes/${bobHash}`).blockers, []);
});

test('contactBlocks endpoint: bad input is refused', async () => {
  const db = fakeDb();
  await assert.rejects(() => call(db, 'amy', { action: 'toString' }), (e) => e.status === 400);
  await assert.rejects(() => call(db, 'amy', { action: 'add', entries: [] }), (e) => e.status === 400);
  await assert.rejects(
    () => call(db, 'amy', { action: 'add', entries: [{ label: 'x', hashes: ['abc'] }] }),
    (e) => e.code === 'no_contact_info',
  );
  await assert.rejects(() => call(db, 'amy', { action: 'setPhone', phone: '123' }), (e) => e.code === 'bad_phone');
});
