const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

process.env.EMAIL_LINK_SECRET = 'test-secret';
const email = require('./email');

test('signup token is bound to the email and expires', () => {
  const now = 1_000_000;
  const token = email.signupToken('Sam@Example.com ', now);
  assert.ok(email.checkSignupToken('sam@example.com', token, now + 1000));
  assert.ok(!email.checkSignupToken('other@example.com', token, now + 1000));
  assert.ok(!email.checkSignupToken('sam@example.com', token, now + 31 * 60 * 1000));
  assert.ok(!email.checkSignupToken('sam@example.com', token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')), now));
  assert.ok(!email.checkSignupToken('sam@example.com', '', now));
});

test('unsubscribe token covers uid and category', () => {
  const url = new URL(email.unsubscribeUrl('uid123', 'activity'));
  const t = url.searchParams.get('t');
  assert.ok(email.checkUnsubscribeToken('uid123', 'activity', t));
  assert.ok(!email.checkUnsubscribeToken('uid123', 'news', t));
  assert.ok(!email.checkUnsubscribeToken('uid999', 'activity', t));
  assert.ok(!email.checkUnsubscribeToken('uid123', 'security', email.unsubscribeUrl('uid123', 'security').split('t=')[1]));
});

test('webhook signature (svix scheme)', () => {
  const secret = `whsec_${Buffer.from('k'.repeat(24)).toString('base64')}`;
  const body = JSON.stringify({ type: 'email.bounced', data: { to: ['a@b.co'] } });
  const ts = 1_700_000_000;
  const sig = crypto
    .createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
    .update(`msg_1.${ts}.${body}`)
    .digest('base64');
  const headers = { 'svix-id': 'msg_1', 'svix-timestamp': String(ts), 'svix-signature': `v1,bogus v1,${sig}` };
  assert.ok(email.verifyWebhook(body, headers, secret, ts + 10));
  assert.ok(!email.verifyWebhook(body + ' ', headers, secret, ts + 10));
  assert.ok(!email.verifyWebhook(body, headers, secret, ts + 3600));
  assert.ok(!email.verifyWebhook(body, headers, '', ts));
});

test('html escapes user content and plain text mirrors it', () => {
  const html = email.renderHtml({ heading: 'Hi <b>', paragraphs: ['A & "B"'], cta: { label: 'Go', url: 'https://x.co/?a=1&b=2' } });
  assert.ok(html.includes('Hi &lt;b&gt;'));
  assert.ok(html.includes('A &amp; &quot;B&quot;'));
  assert.ok(html.includes('https://x.co/?a=1&amp;b=2'));
  const text = email.renderText({ heading: 'Hi', paragraphs: ['Line'], code: '123456' });
  assert.ok(text.includes('123456') && text.includes('Line'));
});

test('reserved test domains never get mail', () => {
  assert.ok(email.looksLikeEmail('sam@gmail.com'));
  assert.ok(!email.looksLikeEmail('diag@datetoday.invalid'));
  assert.ok(!email.looksLikeEmail('a@b.test'));
  assert.ok(!email.looksLikeEmail('not-an-email'));
});

test('every template renders', () => {
  const all = [
    email.T.signupCode('123456'),
    email.T.verifyCode('123456'),
    email.T.welcome('Sam'),
    email.T.passwordReset('https://x.co'),
    email.T.noPassword('Google'),
    email.T.providerAdded('Google'),
    email.T.newMatch('Ava'),
    email.T.likesDigest(1),
    email.T.likesDigest(3),
    email.T.accountDeleted(),
  ];
  for (const t of all) {
    assert.ok(t.subject && t.heading);
    assert.ok(email.renderHtml(t).includes('</html>'));
  }
  assert.match(email.T.likesDigest(3).subject, /3 people/);
});
