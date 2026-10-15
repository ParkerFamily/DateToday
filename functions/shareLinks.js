'use strict';

/**
 * Public DateToday links. Everything people share points at datetd.com, which is served by
 * scripts/web-server.mjs (Replit) and requires this file, so it must stay dependency-free.
 * With the app installed, iOS Universal Links / Android App Links open these paths in the app.
 */
const SITE = 'https://datetd.com';
const APP_STORE_ID = '6810919273';
const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;
const PLAY_STORE_URL = null;
const IOS_APP_ID = '498P597A6L.com.parkerfamily.datetoday';
const ANDROID_PACKAGE = 'com.parkerfamily.datetoday';
/** EAS release keystore. Add Google Play's app-signing key here once the app is on Play. */
const ANDROID_CERT_SHA256 = ['77:16:AD:B3:1B:A0:E5:EA:85:28:A1:10:14:47:D4:30:1B:17:53:95:86:2A:7D:1A:B3:79:86:79:E4:1B:3C:82'];
const OG_IMAGE = `${SITE}/og.png`;

/** Link types the app has a screen for. Only these paths are claimed by the app. */
const SHARE_TYPES = {
  invite: { path: 'invite', clean: (raw) => (/^[A-Za-z0-9]{8}$/.test(raw) ? raw.toUpperCase() : null) },
};

function shareUrl(type, id) {
  const t = SHARE_TYPES[type];
  if (!t) throw new Error(`Unknown share link type: ${type}`);
  const clean = id ? t.clean(String(id)) : null;
  return clean ? `${SITE}/${t.path}/${encodeURIComponent(clean)}` : `${SITE}/${t.path}`;
}

/** /.well-known/apple-app-site-association. "?web=1" stays in the browser (Continue on the web). */
function appleAppSiteAssociation() {
  const components = Object.values(SHARE_TYPES).flatMap((t) => [
    { '/': `/${t.path}/*`, '?': { web: '1' }, exclude: true },
    { '/': `/${t.path}/*` },
  ]);
  return { applinks: { details: [{ appIDs: [IOS_APP_ID], components }] } };
}

/** /.well-known/assetlinks.json */
function assetLinks() {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: ANDROID_CERT_SHA256 },
    },
  ];
}

function platformFor(userAgent) {
  const ua = String(userAgent || '');
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'other';
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The page an invite link opens without the app: invite code, Open in DateToday, store buttons. */
function invitePage(code, { platform = 'other' } = {}) {
  const c = code ? esc(code) : '';
  const url = esc(shareUrl('invite', code));
  const deepLink = c ? `datetoday://invite/${c}` : 'datetoday://';
  const webHref = c ? `/invite/${c}?web=1` : '/';
  const title = "You're invited to DateToday";
  const description = `See who's out tonight and make real plans.${c ? ` Use invite code ${c} for bonus Likes.` : ''}`;
  const play = PLAY_STORE_URL
    ? `<a class="btn alt" href="${esc(PLAY_STORE_URL)}">Get it on Google Play</a>`
    : platform === 'ios'
      ? ''
      : '<small>DateToday for Android is coming to Google Play soon.</small>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.ico">
<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="DateToday">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${OG_IMAGE}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${OG_IMAGE}">
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090B;color:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:420px;padding:32px 24px;text-align:center}
.logo{width:76px;height:76px;border-radius:18px;margin-bottom:20px}
h1{font-size:30px;margin:0 0 8px;font-weight:800}
p{color:#92929D;line-height:1.5;margin:0 0 24px}
.code{display:inline-block;font:700 28px ui-monospace,Menlo,monospace;letter-spacing:4px;padding:14px 22px;border:1px solid #2A2438;border-radius:16px;background:#16131F;color:#22E58B;margin-bottom:24px;user-select:all}
a.btn{display:block;padding:16px;border-radius:14px;background:linear-gradient(90deg,#7C3AED,#C084FC);color:#fff;font-weight:800;text-decoration:none;margin-bottom:12px}
a.btn.alt{background:#16131F;border:1px solid #2A2438;color:#FAFAFA}
a.web{display:inline-block;color:#A855F7;font-weight:700;text-decoration:none;margin-top:8px}
small{display:block;color:#92929D;margin-top:16px}
</style></head><body><main>
<img class="logo" src="/og.png" alt="DateToday">
<h1>${title} ⚡</h1>
<p>See who's out tonight and make real plans.${c ? ' Sign up, then enter this code in Settings → Invite Friends to get 5 bonus Likes.' : ''}</p>
${c ? `<div class="code">${c}</div>` : ''}
<a class="btn" href="${esc(APP_STORE_URL)}">Download on the App Store</a>
<a class="btn alt" href="${deepLink}">Open in DateToday</a>
${play}
<a class="web" href="${webHref}">Use DateToday on the web</a>
</main>
${platform === 'other' ? '' : `<script>setTimeout(function(){location.href=${JSON.stringify(deepLink)}},300)</script>`}
</body></html>`;
}

/** HTML for a public share path, or null when the web app should handle it. */
function landingPageFor(pathname, searchParams, userAgent) {
  if (searchParams && searchParams.get('web') === '1') return null;
  const m = String(pathname || '').match(/^\/invite(?:\/([^/]+))?\/?$/);
  if (!m) return null;
  let raw = '';
  try {
    raw = m[1] ? decodeURIComponent(m[1]) : '';
  } catch {
    raw = '';
  }
  return invitePage(raw ? SHARE_TYPES.invite.clean(raw) : null, { platform: platformFor(userAgent) });
}

module.exports = {
  APP_STORE_URL,
  SITE,
  appleAppSiteAssociation,
  assetLinks,
  invitePage,
  landingPageFor,
  platformFor,
  shareUrl,
};
