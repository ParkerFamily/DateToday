'use strict';

/**
 * Resend email: branded layout, send with suppression / preference checks, signed links,
 * contacts sync and webhook verification.
 * Env: RESEND_API_KEY, RESEND_FROM, EMAIL_LINK_SECRET, RESEND_WEBHOOK_SECRET, optional RESEND_REPLY_TO.
 */
const crypto = require('crypto');

const API = 'https://api.resend.com';
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'datetoday-e1331';
const FN_BASE = `https://us-central1-${PROJECT}.cloudfunctions.net`;
const OPEN_APP_URL = 'https://parkerfamily.github.io/DateToday/open.html';
const PRIVACY_URL = 'https://parkerfamily.github.io/DateToday/legal/privacy.html';

const COLORS = {
  bg: '#09090B',
  card: '#15141B',
  border: '#26242F',
  text: '#F5F3FF',
  muted: '#92929D',
  brand: '#7C3AED',
  brandBright: '#A855F7',
};

/** Categories a member can switch off. Security and account mail always goes out. */
const PREF_FOR_CATEGORY = { activity: 'emailActivity', news: 'emailNews' };
const PREF_DEFAULTS = { emailActivity: true, emailNews: false };

const apiKey = () => process.env.RESEND_API_KEY || '';
const linkSecret = () => process.env.EMAIL_LINK_SECRET || '';
const fromAddress = () => process.env.RESEND_FROM || 'DateToday <onboarding@resend.dev>';

const normEmail = (email) => String(email || '').trim().toLowerCase();
const emailHash = (email) => crypto.createHash('sha256').update(normEmail(email)).digest('hex');
const RESERVED_TLD = /\.(invalid|test|example|localhost)$/;
const looksLikeEmail = (email) => {
  const address = normEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address) && address.length <= 254 && !RESERVED_TLD.test(address);
};

function sign(payload) {
  return crypto.createHmac('sha256', linkSecret()).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

function unsubscribeToken(uid, category) {
  return sign(`unsub|${uid}|${category}`);
}

function checkUnsubscribeToken(uid, category, token) {
  return Boolean(linkSecret() && uid && PREF_FOR_CATEGORY[category]) && safeEqual(unsubscribeToken(uid, category), token);
}

function unsubscribeUrl(uid, category) {
  const q = new URLSearchParams({ u: uid, c: category, t: unsubscribeToken(uid, category) });
  return `${FN_BASE}/emailUnsubscribe?${q}`;
}

const SIGNUP_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Proof that an address passed the signup code. Stateless; expires in 30 minutes. */
function signupToken(email, now = Date.now()) {
  const exp = now + SIGNUP_TOKEN_TTL_MS;
  return `${exp}.${sign(`signup|${normEmail(email)}|${exp}`)}`;
}

function checkSignupToken(email, token, now = Date.now()) {
  const [expRaw, sig] = String(token || '').split('.');
  const exp = Number(expRaw);
  if (!linkSecret() || !sig || !Number.isFinite(exp) || exp < now) return false;
  return safeEqual(sign(`signup|${normEmail(email)}|${exp}`), sig);
}

function openAppUrl(path) {
  return `${OPEN_APP_URL}?to=${encodeURIComponent(path || '/')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Table-based dark layout that survives Gmail, Outlook and Apple Mail.
 * `paragraphs` are plain strings (escaped here).
 */
function renderHtml({ preheader, heading, paragraphs = [], code, cta, footerNote, unsubscribe }) {
  const p = paragraphs
    .map((t) => `<p style="margin:0 0 14px;color:${COLORS.text};font-size:16px;line-height:24px;">${escapeHtml(t)}</p>`)
    .join('');
  const codeBlock = code
    ? `<div style="margin:8px 0 20px;padding:18px 0;border-radius:14px;background:${COLORS.bg};border:1px solid ${COLORS.border};text-align:center;font-size:34px;letter-spacing:10px;font-weight:800;color:${COLORS.text};font-family:'SF Mono',Menlo,Consolas,monospace;">${escapeHtml(code)}</div>`
    : '';
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 18px;"><tr><td style="border-radius:999px;background:${COLORS.brand};background-image:linear-gradient(90deg,${COLORS.brand},${COLORS.brandBright});"><a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-weight:700;font-size:16px;text-decoration:none;border-radius:999px;">${escapeHtml(cta.label)}</a></td></tr></table>`
    : '';
  const note = footerNote
    ? `<p style="margin:16px 0 0;color:${COLORS.muted};font-size:13px;line-height:19px;">${escapeHtml(footerNote)}</p>`
    : '';
  const unsub = unsubscribe
    ? ` · <a href="${escapeHtml(unsubscribe)}" style="color:${COLORS.muted};text-decoration:underline;">Unsubscribe</a>`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
<tr><td style="padding:0 4px 20px;font-size:22px;font-weight:800;letter-spacing:-0.3px;color:${COLORS.text};">Date<span style="color:${COLORS.brandBright};">Today</span></td></tr>
<tr><td style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:20px;padding:28px 24px;">
<h1 style="margin:0 0 16px;color:${COLORS.text};font-size:24px;line-height:30px;font-weight:800;">${escapeHtml(heading)}</h1>
${p}${codeBlock}${button}${note}
</td></tr>
<tr><td style="padding:18px 4px 0;color:${COLORS.muted};font-size:12px;line-height:18px;">DateToday · Meet tonight, not someday.<br><a href="${PRIVACY_URL}" style="color:${COLORS.muted};text-decoration:underline;">Privacy</a>${unsub}</td></tr>
</table></td></tr></table></body></html>`;
}

function renderText({ heading, paragraphs = [], code, cta, footerNote, unsubscribe }) {
  return [
    heading,
    '',
    ...paragraphs,
    code ? `\n${code}\n` : '',
    cta ? `${cta.label}: ${cta.url}` : '',
    footerNote || '',
    '',
    '— DateToday',
    unsubscribe ? `Unsubscribe: ${unsubscribe}` : '',
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n')
    .trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resendFetch(path, { method = 'GET', body, headers = {} } = {}, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json', ...headers },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, status: res.status, json };
      last = { ok: false, status: res.status, json };
      if (res.status !== 429 && res.status < 500) return last;
    } catch (error) {
      last = { ok: false, status: 0, json: { message: String(error) } };
    }
    if (attempt < attempts) await sleep(600 * 2 ** (attempt - 1));
  }
  return last;
}

async function isSuppressed(db, email) {
  const snap = await db.collection('emailSuppressions').doc(emailHash(email)).get();
  return snap.exists;
}

async function categoryEnabled(db, uid, category) {
  const key = PREF_FOR_CATEGORY[category];
  if (!key || !uid) return true;
  const snap = await db.collection('notificationPrefs').doc(uid).get();
  const value = snap.exists ? snap.get(key) : undefined;
  return typeof value === 'boolean' ? value : PREF_DEFAULTS[key];
}

/**
 * Send one email. Never throws; returns { sent, id?, reason?, status? }.
 * `category`: 'security' | 'account' | 'activity' | 'news'. Activity/news honor preferences and
 * carry one-click unsubscribe headers.
 */
async function sendEmail(db, { to, uid, category = 'account', idempotencyKey, subject, ...content }) {
  const email = normEmail(to);
  if (!apiKey()) return { sent: false, reason: 'not_configured' };
  if (!looksLikeEmail(email)) return { sent: false, reason: 'bad_address' };
  try {
    if (db && (await isSuppressed(db, email))) return { sent: false, reason: 'suppressed' };
    if (db && !(await categoryEnabled(db, uid, category))) return { sent: false, reason: 'opted_out' };
  } catch (error) {
    console.warn('email precheck failed', String(error));
  }

  const unsubscribe = PREF_FOR_CATEGORY[category] && uid && linkSecret() ? unsubscribeUrl(uid, category) : null;
  const body = {
    from: fromAddress(),
    to: [email],
    subject,
    html: renderHtml({ ...content, unsubscribe }),
    text: renderText({ ...content, unsubscribe }),
    tags: [{ name: 'category', value: category }],
  };
  if (process.env.RESEND_REPLY_TO) body.reply_to = process.env.RESEND_REPLY_TO;
  if (unsubscribe) {
    body.headers = { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
  }
  const res = await resendFetch('/emails', {
    method: 'POST',
    body,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey.slice(0, 256) } : {},
  });
  if (res.ok) return { sent: true, id: res.json.id };
  console.error('Resend send failed', { category, status: res.status, message: res.json && res.json.message });
  return { sent: false, reason: 'error', status: res.status, message: res.json && res.json.message };
}

/** Keep the member in Resend Contacts so Broadcasts only reach people who opted in to news. */
async function syncContact({ email, firstName, unsubscribed }) {
  const address = normEmail(email);
  if (!apiKey() || !looksLikeEmail(address)) return false;
  const fields = { unsubscribed: Boolean(unsubscribed), ...(firstName ? { first_name: String(firstName).slice(0, 60) } : {}) };
  const updated = await resendFetch(`/contacts/${encodeURIComponent(address)}`, { method: 'PATCH', body: fields });
  if (updated.ok) return true;
  const created = await resendFetch('/contacts', { method: 'POST', body: { email: address, ...fields } });
  if (!created.ok) console.warn('Resend contact sync failed', created.status, created.json && created.json.message);
  return created.ok;
}

async function removeContact(email) {
  const address = normEmail(email);
  if (!apiKey() || !looksLikeEmail(address)) return;
  await resendFetch(`/contacts/${encodeURIComponent(address)}`, { method: 'DELETE' }, 1);
}

/** Resend signs webhooks the Svix way: HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
function verifyWebhook(rawBody, headers, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const id = headers['svix-id'];
  const ts = headers['svix-timestamp'];
  const signatures = headers['svix-signature'];
  if (!secret || !id || !ts || !signatures) return false;
  if (Math.abs(nowSeconds - Number(ts)) > 5 * 60) return false;
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest('base64');
  return String(signatures)
    .split(' ')
    .some((entry) => {
      const [version, sig] = entry.split(',');
      return version === 'v1' && sig && safeEqual(sig, expected);
    });
}

const T = {
  signupCode: (code) => ({
    subject: `${code} is your DateToday code`,
    preheader: 'Enter this code to confirm your email.',
    heading: 'Confirm your email',
    paragraphs: ['Enter this code in DateToday to keep setting up your account. It expires in 10 minutes.'],
    code,
    footerNote: 'Didn’t try to sign up? You can ignore this email.',
  }),
  verifyCode: (code) => ({
    subject: `${code} is your DateToday code`,
    preheader: 'Enter this code to verify your email.',
    heading: 'Verify your email',
    paragraphs: ['Enter this code in DateToday to verify your email. It expires in 10 minutes.'],
    code,
    footerNote: 'Didn’t request this? You can ignore this email.',
  }),
  welcome: (name) => ({
    subject: 'Welcome to DateToday',
    preheader: 'Go Live tonight and see who’s nearby.',
    heading: `You’re in${name ? `, ${name}` : ''}.`,
    paragraphs: [
      'DateToday is for meeting tonight, not someday. Go Live when you’re free and see who nearby is up for it too.',
      'Tip: verified profiles with a short video get far more hearts. It takes a minute.',
    ],
    cta: { label: 'Open DateToday', url: openAppUrl('/') },
  }),
  passwordReset: (link) => ({
    subject: 'Reset your DateToday password',
    preheader: 'Choose a new password.',
    heading: 'Reset your password',
    paragraphs: ['Tap the button to choose a new password. The link expires in 1 hour.'],
    cta: { label: 'Choose a new password', url: link },
    footerNote: 'Didn’t ask for this? Ignore this email — your password stays the same.',
  }),
  noPassword: (labels) => ({
    subject: 'About your DateToday password',
    preheader: `You sign in with ${labels}.`,
    heading: `You sign in with ${labels}`,
    paragraphs: [
      `Your DateToday account uses ${labels} to sign in, so there’s no password to reset. Tap Continue with ${labels} on the login screen.`,
      'Want a password too? After you sign in, go to Settings › Account information › Add password.',
    ],
    footerNote: 'Didn’t ask for this? You can ignore this email.',
  }),
  providerAdded: (label) => ({
    subject: `${label} sign-in was added to your DateToday account`,
    preheader: `You can now sign in with ${label}.`,
    heading: `${label} sign-in added`,
    paragraphs: [
      `${label} is now connected to your DateToday account, so you can use it to sign in. It’s still the same account — same profile, matches and chats.`,
    ],
    footerNote: 'Wasn’t you? Reset your password from the DateToday login screen and contact DateToday support right away.',
  }),
  newMatch: (name, matchId) => ({
    subject: `It’s a match with ${name}!`,
    preheader: 'Say hey and plan tonight.',
    heading: 'It’s a match!',
    paragraphs: [`You and ${name} are into each other. Say hey and make a plan for tonight.`],
    cta: { label: 'Say hey', url: openAppUrl(matchId ? `/chat/${matchId}` : '/dates') },
  }),
  likesDigest: (count) => ({
    subject: count === 1 ? 'Someone liked you on DateToday' : `${count} people liked you on DateToday`,
    preheader: 'Heart them back to match.',
    heading: count === 1 ? 'Someone’s into you' : `${count} people are into you`,
    paragraphs: [
      count === 1
        ? 'Someone tapped Interested on you today. Heart them back to match.'
        : `${count} people tapped Interested on you today. Heart them back to match.`,
    ],
    cta: { label: 'See who', url: openAppUrl('/likes') },
  }),
  accountDeleted: () => ({
    subject: 'Your DateToday account was deleted',
    preheader: 'Your profile, matches and chats are gone.',
    heading: 'Your account was deleted',
    paragraphs: [
      'Your DateToday profile, photos, matches and chats have been permanently deleted.',
      'If you had DateToday+, cancel it in your App Store or Google Play subscriptions so you’re not charged again.',
    ],
    footerNote: 'Wasn’t you? Contact DateToday support right away.',
  }),
};

module.exports = {
  PREF_FOR_CATEGORY,
  PREF_DEFAULTS,
  T,
  checkSignupToken,
  checkUnsubscribeToken,
  emailHash,
  escapeHtml,
  looksLikeEmail,
  normEmail,
  openAppUrl,
  removeContact,
  renderHtml,
  renderText,
  resendFetch,
  sendEmail,
  signupToken,
  syncContact,
  unsubscribeUrl,
  verifyWebhook,
};
