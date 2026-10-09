'use strict';

/**
 * Priority Like: a DateToday+ Like that ranks first in the recipient's likes and may carry one
 * short note. It's a field on the normal interests/{from}_{to} doc, never a separate chat.
 * Limits live in appConfig/priorityLikes so they can change without an app release.
 */
const DEFAULT_CONFIG = { enabled: true, noteMaxChars: 80, dailyLimit: 5 };
const CONFIG_TTL_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

let cache = null;

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function normalizeConfig(raw) {
  const d = raw || {};
  return {
    enabled: d.enabled !== false,
    noteMaxChars: clampInt(d.noteMaxChars, 20, 200, DEFAULT_CONFIG.noteMaxChars),
    dailyLimit: clampInt(d.dailyLimit, 1, 50, DEFAULT_CONFIG.dailyLimit),
  };
}

async function loadConfig(db, now = Date.now()) {
  if (cache && now - cache.at < CONFIG_TTL_MS) return cache.config;
  const snap = await db.collection('appConfig').doc('priorityLikes').get().catch(() => null);
  const config = normalizeConfig(snap && snap.exists ? snap.data() : null);
  cache = { at: now, config };
  return config;
}

const LINK_RE =
  /(https?:\/\/|www\.)|\b[a-z0-9-]{2,}(\.|\s*\(dot\)\s*|\s*\[dot\]\s*)(com|net|org|io|co|me|app|ly|gg|link|xyz|info|biz|us|tv|ru|to|page|site|bio)\b/i;
const EMAIL_RE = /[^\s@]+\s*(@|\(at\)|\[at\])\s*[^\s@]+\.[a-z]{2,}/i;
const HANDLE_RE = /(^|[\s(])@[a-z0-9_.]{2,}|\b(snap(chat)?|insta(gram)?|ig|telegram|whatsapp|cash\s?app|venmo|onlyfans|kik)\s*[:@-]/i;
// Seven or more digits, allowing the usual separators and spelled-out spacing.
const PHONE_RE = /(\d[\s().+-]*){7,}/;
const BLOCKED_WORDS = [
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'tranny', 'chink', 'spic', 'kike', 'wetback',
  'cunt', 'whore', 'slut', 'pussy', 'cock', 'dick', 'nudes', 'sext', 'blowjob', 'bj',
];
const BLOCKED_RE = new RegExp(`\\b(${BLOCKED_WORDS.join('|')})s?\\b`, 'i');

function noteError(message, code) {
  return Object.assign(new Error(message), { status: 400, code });
}

/** One line, plain text, no contact details. Returns the cleaned note or null; throws a 400 otherwise. */
function cleanNote(raw, maxChars = DEFAULT_CONFIG.noteMaxChars) {
  if (raw == null) return null;
  if (typeof raw !== 'string') throw noteError('That note can’t be sent.', 'note_invalid');
  const text = raw
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  if ([...text].length > maxChars) {
    throw noteError(`Keep your note to ${maxChars} characters.`, 'note_too_long');
  }
  if (LINK_RE.test(text) || EMAIL_RE.test(text) || HANDLE_RE.test(text)) {
    throw noteError('Notes can’t include links, emails or social handles.', 'note_contact');
  }
  if (PHONE_RE.test(text)) throw noteError('Notes can’t include phone numbers.', 'note_contact');
  const squashed = text.toLowerCase().replace(/[0@4$1!3]/g, (c) => ({ 0: 'o', '@': 'a', 4: 'a', $: 's', 1: 'i', '!': 'i', 3: 'e' })[c]);
  if (BLOCKED_RE.test(text) || BLOCKED_RE.test(squashed)) {
    throw noteError('Keep it friendly — that note can’t be sent.', 'note_blocked');
  }
  return text;
}

/** Incoming likes: Priority Likes first (newest first), then normal likes oldest first. */
function rankLikes(rows) {
  const priority = rows.filter((r) => r.priority).sort((a, b) => (b.priorityAt || 0) - (a.priorityAt || 0));
  const normal = rows.filter((r) => !r.priority).sort((a, b) => a.createdAt - b.createdAt);
  return [...priority, ...normal];
}

/** Does `pref` ("men" | "women" | "everyone") include `gender`? Unknown never passes. */
function interestedIn(pref, gender) {
  if (pref === 'men') return gender === 'man';
  if (pref === 'women') return gender === 'woman';
  if (pref === 'everyone') return ['man', 'woman', 'nonbinary'].includes(gender);
  return false;
}

function resetConfigCache() {
  cache = null;
}

module.exports = {
  DAY_MS,
  DEFAULT_CONFIG,
  cleanNote,
  interestedIn,
  loadConfig,
  normalizeConfig,
  rankLikes,
  resetConfigCache,
};
