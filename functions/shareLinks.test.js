'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const links = require('./shareLinks');

test('shareUrl: branded datetd.com links, never Cloud Functions', () => {
  assert.equal(links.shareUrl('invite', 'AB2C3D4E'), 'https://datetd.com/invite/AB2C3D4E');
  assert.equal(links.shareUrl('invite', 'ab2c3d4e'), 'https://datetd.com/invite/AB2C3D4E');
  assert.equal(links.shareUrl('invite', null), 'https://datetd.com/invite');
  assert.equal(links.shareUrl('invite', '../x'), 'https://datetd.com/invite');
  assert.throws(() => links.shareUrl('profile', 'abc'));
  assert.ok(!links.shareUrl('invite', 'AB2C3D4E').includes('cloudfunctions'));
});

test('apple-app-site-association: the app claims share paths, except "Continue on the web"', () => {
  const [detail] = links.appleAppSiteAssociation().applinks.details;
  assert.deepEqual(detail.appIDs, ['498P597A6L.com.parkerfamily.datetoday']);
  assert.deepEqual(detail.components, [
    { '/': '/invite/*', '?': { web: '1' }, exclude: true },
    { '/': '/invite/*' },
  ]);
});

test('assetlinks.json: package and the EAS release key fingerprint', () => {
  const [entry] = links.assetLinks();
  assert.deepEqual(entry.relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(entry.target.package_name, 'com.parkerfamily.datetoday');
  assert.equal(
    entry.target.sha256_cert_fingerprints[0].replace(/:/g, '').toLowerCase(),
    '7716adb31ba0e5ea8528a1101447d4301b175395862a7d1ab3798679e41b3c82',
  );
});

test('landingPageFor: invite paths get the branded page, everything else goes to the web app', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
  const html = links.landingPageFor('/invite/ab2c3d4e', new URLSearchParams(), iphone);
  assert.ok(html.includes('<div class="code">AB2C3D4E</div>'));
  assert.ok(html.includes('datetoday://invite/AB2C3D4E'));
  assert.ok(html.includes('https://apps.apple.com/app/id6810919273'));
  assert.ok(html.includes('Open in DateToday'));
  assert.ok(html.includes('<meta property="og:url" content="https://datetd.com/invite/AB2C3D4E">'));
  assert.ok(html.includes('og:image'));
  assert.ok(html.includes('location.href'));
  assert.ok(!html.includes('cloudfunctions'));

  const desktop = links.landingPageFor('/invite/AB2C3D4E', new URLSearchParams(), 'Mozilla/5.0 (Macintosh)');
  assert.ok(!desktop.includes('location.href'), 'desktop never jumps to the app scheme');
  assert.ok(desktop.includes('Google Play'));

  const bad = links.landingPageFor('/invite/%3Cscript%3E', new URLSearchParams(), iphone);
  assert.ok(!bad.includes('<script>alert') && !bad.includes('class="code"'));
  assert.ok(links.landingPageFor('/invite', new URLSearchParams(), iphone).includes("You're invited"));

  assert.equal(links.landingPageFor('/invite/AB2C3D4E', new URLSearchParams('web=1'), iphone), null);
  assert.equal(links.landingPageFor('/chat/abc', new URLSearchParams(), iphone), null);
  assert.equal(links.landingPageFor('/', new URLSearchParams(), iphone), null);
});
