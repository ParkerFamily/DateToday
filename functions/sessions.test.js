const test = require('node:test');
const assert = require('node:assert/strict');
const sessions = require('./sessions');

test('only public IPs are looked up', () => {
  for (const ip of ['', 'unknown', '10.0.0.4', '127.0.0.1', '192.168.1.9', '172.20.3.3', '100.72.1.1', '169.254.1.1', '::1', 'fd00::1', 'fe80::1']) {
    assert.equal(sessions.isPublicIp(ip), false, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '2600:1702:83f0:9e20::1']) assert.equal(sessions.isPublicIp(ip), true, ip);
});

test('lookupLocation reads FreeIPAPI and fails soft', async () => {
  const ok = async (url) => {
    assert.equal(url, 'https://free.freeipapi.com/api/v1/json/8.8.8.8');
    return { ok: true, json: async () => ({ cityName: 'Mountain View', regionName: 'California', regionCode: 'CA', countryName: 'United States', countryCode: 'US' }) };
  };
  assert.deepEqual(await sessions.lookupLocation('8.8.8.8', ok), {
    city: 'Mountain View',
    region: 'CA',
    country: 'United States',
    countryCode: 'US',
  });
  assert.equal(await sessions.lookupLocation('8.8.8.8', async () => ({ ok: false })), null);
  assert.equal(await sessions.lookupLocation('8.8.8.8', async () => { throw new Error('timeout'); }), null);
  assert.equal(await sessions.lookupLocation('8.8.8.8', async () => ({ ok: true, json: async () => ({ cityName: '', countryName: '' }) })), null);
  assert.equal(await sessions.lookupLocation('10.0.0.1', ok), null);
});

test('placeLabel uses state codes in the US and country names elsewhere', () => {
  assert.equal(sessions.placeLabel({ city: 'Dallas', region: 'TX', country: 'United States', countryCode: 'US' }), 'Dallas, TX');
  assert.equal(sessions.placeLabel({ city: 'London', region: 'ENG', country: 'United Kingdom', countryCode: 'GB' }), 'London, United Kingdom');
  assert.equal(sessions.placeLabel({ city: '', region: '', country: 'France', countryCode: 'FR' }), 'France');
  assert.equal(sessions.placeLabel(null), '');
});

test('sign-in push names the device and place and opens Devices', () => {
  const s = { deviceLabel: 'Samsung SM-N986U', location: { city: 'Dallas', region: 'TX', country: 'United States', countryCode: 'US' } };
  const plain = sessions.signInPush(s, { needsCode: false });
  assert.equal(plain.body, 'Your account was signed in on Samsung SM-N986U near Dallas, TX. Not you? Tap to sign it out.');
  assert.deepEqual(plain.data, { type: 'security', url: '/settings/devices' });
  assert.match(sessions.signInPush({ ...s, location: null }, { needsCode: true }).body, /^Someone signed in on Samsung SM-N986U and needs the code/);
});

test('readDevice validates ids, hashes the device id and cleans labels', () => {
  const d = sessions.readDevice({
    sessionId: 'sess_abcdefghijklmnop',
    deviceId: 'dev_abcdefghijklmnopq',
    platform: 'android',
    deviceLabel: '  Samsung\n<b>SM-N986U</b>  ',
    appVersion: '1.0.2',
  });
  assert.equal(d.deviceLabel, 'Samsung bSM-N986U/b');
  assert.equal(d.deviceHash, sessions.deviceHash('dev_abcdefghijklmnopq'));
  assert.notEqual(d.deviceHash, 'dev_abcdefghijklmnopq');
  assert.equal(sessions.readDevice({ sessionId: 'sess_abcdefghijklmnop', deviceId: 'dev_abcdefghijklmnopq', platform: 'x' }).deviceLabel, 'Web browser');
  assert.throws(() => sessions.readDevice({ sessionId: 'short', deviceId: 'dev_abcdefghijklmnopq' }), /Update DateToday/);
  assert.throws(() => sessions.readDevice({ sessionId: 'sess_abcdefghijklmnop', deviceId: '../../etc/passwd/xx' }), /Update DateToday/);
});

test('maskEmail keeps the domain and hides most of the name', () => {
  assert.equal(sessions.maskEmail('veezparker@gmail.com'), 've••••••@gmail.com');
  assert.equal(sessions.maskEmail('a@b.co'), 'a•@b.co');
  assert.equal(sessions.maskEmail(''), '');
});
