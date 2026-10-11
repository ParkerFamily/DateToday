/** Chat extras: GIF search (GIPHY), message reactions, and previews for GIF messages. */

/** Must match MESSAGE_REACTIONS in features/matches/reactions.ts and the list in firestore.rules. */
const REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👍'];

const GIF_ID = /^[A-Za-z0-9]{4,40}$/;
const PAGE_SIZE = 24;
const MAX_OFFSET = 240;

function cleanQuery(raw) {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ').slice(0, 50) : '';
}

function cleanOffset(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_OFFSET, n - (n % PAGE_SIZE));
}

/** GIPHY result → { id, w, h } (the 200px-wide rendition's size). The app builds media URLs from the id. */
function parseGifs(json) {
  const out = [];
  const seen = new Set();
  for (const g of (json && json.data) || []) {
    const fw = g && g.images && g.images.fixed_width;
    const id = g && typeof g.id === 'string' ? g.id : '';
    const w = Number(fw && fw.width);
    const h = Number(fw && fw.height);
    if (!GIF_ID.test(id) || seen.has(id) || !(w > 0) || !(h > 0)) continue;
    seen.add(id);
    out.push({ id, w: Math.round(w), h: Math.round(h) });
  }
  return out;
}

function giphyUrl(apiKey, query, offset) {
  const params = new URLSearchParams({
    api_key: apiKey,
    limit: String(PAGE_SIZE),
    offset: String(offset),
    rating: 'pg-13',
    bundle: 'messaging_non_clips',
  });
  if (query) {
    params.set('q', query);
    params.set('lang', 'en');
  }
  return `https://api.giphy.com/v1/gifs/${query ? 'search' : 'trending'}?${params}`;
}

function cacheKey(query, offset) {
  return `${query ? `s|${query.toLowerCase()}` : 'trending'}|${offset}`;
}

/** Trending changes during the day; a search's results barely move. */
function cacheTtlMs(query) {
  return query ? 12 * 3600 * 1000 : 2 * 3600 * 1000;
}

/** The emoji `uid`-other-than-sender just put on a message that had none from them, else null. */
function reactionAdded(before, after) {
  const prev = (before && before.reactions) || {};
  const next = (after && after.reactions) || {};
  for (const [uid, emoji] of Object.entries(next)) {
    if (uid === after.senderId || prev[uid] || !REACTIONS.includes(emoji)) continue;
    return { uid, emoji };
  }
  return null;
}

/** Inbox / push line for a new message. */
function messagePreview(msg, proposalSummary) {
  if (msg.type === 'date_proposal') return `Date idea: ${proposalSummary(msg.proposal)}`.slice(0, 140);
  if (msg.type === 'gif') return 'Sent a GIF';
  return String(msg.text || '').slice(0, 140);
}

/** Push copy when someone reacts to your message. */
function reactionPush(name, emoji, msg) {
  const what = msg.type === 'gif'
    ? 'your GIF'
    : `“${String(msg.text || '').replace(/\s+/g, ' ').trim().slice(0, 80)}”`;
  return emoji === '❤️'
    ? { title: `${name} liked your message`, body: msg.type === 'gif' ? 'Liked your GIF' : what }
    : { title: `${name} reacted ${emoji}`, body: `to ${what}` };
}

module.exports = {
  REACTIONS,
  GIF_ID,
  PAGE_SIZE,
  cleanQuery,
  cleanOffset,
  parseGifs,
  giphyUrl,
  cacheKey,
  cacheTtlMs,
  reactionAdded,
  messagePreview,
  reactionPush,
};
