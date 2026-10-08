const test = require('node:test');
const assert = require('node:assert');
const { geohashOf, expectedGeohash, syncGeohash } = require('./geo');

test('geohash is stable for the rounded point', () => {
  assert.strictEqual(geohashOf(40.71, -74.01), geohashOf(40.71, -74.01));
  assert.strictEqual(geohashOf(40.71, -74.01).length, 9);
  assert.notStrictEqual(geohashOf(40.71, -74.01), geohashOf(34.05, -118.24));
});

test('no geohash without a usable point', () => {
  assert.strictEqual(expectedGeohash(null), null);
  assert.strictEqual(expectedGeohash({ latitude: '40.7', longitude: -74 }), null);
  assert.strictEqual(expectedGeohash({ latitude: 91, longitude: 0 }), null);
  assert.strictEqual(expectedGeohash({ latitude: NaN, longitude: 0 }), null);
});

test('syncGeohash writes only when missing or stale', async () => {
  const writes = [];
  const snap = (data) => ({ exists: true, data: () => data, ref: { update: async (p) => writes.push(p) } });
  assert.strictEqual(await syncGeohash(snap({ latitude: 40.71, longitude: -74.01 })), true);
  assert.deepStrictEqual(writes, [{ geohash: geohashOf(40.71, -74.01) }]);
  assert.strictEqual(
    await syncGeohash(snap({ latitude: 40.71, longitude: -74.01, geohash: geohashOf(40.71, -74.01) })),
    false,
  );
  assert.strictEqual(await syncGeohash(snap({ latitude: 40.72, longitude: -74.01, geohash: geohashOf(40.71, -74.01) })), true);
  assert.strictEqual(await syncGeohash({ exists: false }), false);
  assert.strictEqual(writes.length, 2);
});
