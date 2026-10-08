const test = require('node:test');
const assert = require('node:assert');
const { canonicalEmail, claimInbox, findInboxOwner } = require('./emailIdentity');

test('gmail dots, +tags, case and googlemail collapse to one inbox', () => {
  const same = ['John.Doe@gmail.com', 'johndoe@gmail.com', 'j.o.h.n.d.o.e+dates@GMAIL.com', 'johndoe@googlemail.com', ' johndoe+x@gmail.com '];
  assert.deepStrictEqual(new Set(same.map(canonicalEmail)), new Set(['johndoe@gmail.com']));
});

test('other providers keep dots but drop +tags', () => {
  assert.strictEqual(canonicalEmail('Sam.Lee+app@outlook.com'), 'sam.lee@outlook.com');
  assert.notStrictEqual(canonicalEmail('sam.lee@outlook.com'), canonicalEmail('samlee@outlook.com'));
});

function fakeDb() {
  const docs = new Map();
  const ref = (id) => ({
    id,
    get: async () => ({ exists: docs.has(id), get: (k) => (docs.get(id) || {})[k] }),
    set: async (v) => docs.set(id, v),
  });
  return { docs, collection: () => ({ doc: ref }) };
}

function fakeAuth(users) {
  return {
    getUser: async (uid) => {
      const u = users[uid];
      if (!u) throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
      return u;
    },
  };
}

test('claim and find the owner of an inbox', async () => {
  const db = fakeDb();
  const users = { A: { uid: 'A', email: 'johndoe@gmail.com' }, B: { uid: 'B', email: 'john.doe@gmail.com' } };
  const auth = fakeAuth(users);
  assert.strictEqual(await claimInbox(db, auth, 'A', 'johndoe@gmail.com'), true);
  assert.strictEqual(await claimInbox(db, auth, 'B', 'john.doe@gmail.com'), false);
  assert.strictEqual((await findInboxOwner(db, auth, 'John.Doe+x@gmail.com')).uid, 'A');
  assert.strictEqual(await findInboxOwner(db, auth, 'johndoe@gmail.com', 'A'), null);
  delete users.A;
  assert.strictEqual(await findInboxOwner(db, auth, 'john.doe@gmail.com'), null, 'deleted owner frees the inbox');
  assert.strictEqual(await claimInbox(db, auth, 'B', 'john.doe@gmail.com'), true);
});