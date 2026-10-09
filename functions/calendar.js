/**
 * "Add to calendar" for accepted date plans, without a native calendar module:
 * iOS opens an .ics link (Calendar's own "Add" sheet), Android a Google Calendar template.
 */
const crypto = require('crypto');

const EVENT_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const DURATION_MIN = { coffee: 60, drinks: 120, dinner: 120, activity: 120 };

function icsEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

/** RFC 5545 lines are folded at 75 octets. */
function fold(line) {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > 75) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

const icsTime = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function eventFor(proposal, otherName) {
  const start = Date.parse(proposal && proposal.startsAt);
  if (!Number.isFinite(start)) return null;
  const minutes = DURATION_MIN[proposal.activity] || 120;
  const activity = String(proposal.activityLabel || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
  const venue = String(proposal.venueName || '').trim();
  const location = [venue, proposal.venueAddress, proposal.neighborhood].filter(Boolean).join(', ');
  return {
    title: `Date with ${otherName || 'your match'}${activity ? ` · ${activity}` : ''}`,
    start,
    end: start + minutes * 60 * 1000,
    location,
    lat: typeof proposal.venueLat === 'number' ? proposal.venueLat : null,
    lng: typeof proposal.venueLng === 'number' ? proposal.venueLng : null,
    notes: `Planned on DateToday${venue ? ` · ${venue}` : ''}. Meet in public and share your plans with a friend.`,
  };
}

/** Same plan → same calendar UID per person, so re-adding updates and a cancel removes it. */
function eventUidFor(matchId, messageId, uid) {
  return crypto.createHash('sha1').update(`${matchId}/${messageId}/${uid}`).digest('hex');
}

function buildIcs(ev, uid, now = Date.now(), { canceled = false } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//DateToday//Dates//EN',
    'CALSCALE:GREGORIAN',
    canceled ? 'METHOD:CANCEL' : 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@datetoday.app`,
    `DTSTAMP:${icsTime(now)}`,
    `DTSTART:${icsTime(ev.start)}`,
    `DTEND:${icsTime(ev.end)}`,
    `SUMMARY:${icsEscape(canceled ? `Canceled: ${ev.title}` : ev.title)}`,
    ev.location ? `LOCATION:${icsEscape(ev.location)}` : null,
    ev.lat != null && ev.lng != null ? `GEO:${ev.lat};${ev.lng}` : null,
    `DESCRIPTION:${icsEscape(ev.notes)}`,
    canceled ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    canceled ? 'SEQUENCE:1' : 'SEQUENCE:0',
    canceled ? null : 'BEGIN:VALARM',
    canceled ? null : 'ACTION:DISPLAY',
    canceled ? null : `DESCRIPTION:${icsEscape(ev.title)}`,
    canceled ? null : 'TRIGGER:-PT1H',
    canceled ? null : 'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

function googleCalendarUrl(ev) {
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', ev.title);
  url.searchParams.set('dates', `${icsTime(ev.start)}/${icsTime(ev.end)}`);
  if (ev.location) url.searchParams.set('location', ev.location);
  url.searchParams.set('details', ev.notes);
  return url.toString();
}

/** POST { matchId, messageId } (signed in, match member, accepted plan) → { icsUrl, googleUrl }. */
async function createCalendarLink(req, res, { db, requireUser, publicUrl }) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    const decoded = await requireUser(req);
    const matchId = String((req.body && req.body.matchId) || '').slice(0, 200);
    const messageId = String((req.body && req.body.messageId) || '').slice(0, 200);
    if (!matchId || !messageId) return res.status(400).json({ error: 'Missing plan.' });

    const matchSnap = await db.collection('matches').doc(matchId).get();
    const match = matchSnap.exists ? matchSnap.data() : null;
    if (!match || !(match.userIds || []).includes(decoded.uid)) {
      return res.status(404).json({ error: 'That plan isn’t available.' });
    }
    const msgSnap = await db.collection('matches').doc(matchId).collection('messages').doc(messageId).get();
    const msg = msgSnap.exists ? msgSnap.data() : null;
    if (!msg || msg.type !== 'date_proposal' || msg.status !== 'accepted') {
      return res.status(409).json({ error: 'Only accepted plans can be added to your calendar.' });
    }
    const otherUid = (match.userIds || []).find((u) => u !== decoded.uid);
    const otherName = ((match.users || {})[otherUid] || {}).displayName || 'your match';
    const ev = eventFor(msg.proposal, String(otherName).split(/\s+/)[0]);
    if (!ev) return res.status(409).json({ error: 'This plan has no time set.' });

    const eventUid = eventUidFor(matchId, messageId, decoded.uid);
    const token = crypto.randomBytes(18).toString('base64url');
    await db.collection('calendarEvents').doc(token).set({
      uid: decoded.uid,
      eventUid,
      ics: buildIcs(ev, eventUid),
      expiresAt: Date.now() + EVENT_TTL_MS,
      createdAt: Date.now(),
    });
    return res.json({ icsUrl: `${publicUrl}?t=${token}`, googleUrl: googleCalendarUrl(ev) });
  } catch (error) {
    console.error('createCalendarLink failed', error && error.message);
    return res.status(error.status || 500).json({ error: 'Couldn’t add this to your calendar right now.' });
  }
}

/** GET ?t=token → the .ics file. The token is unguessable and only ever shown to its owner. */
async function calendarEvent(req, res, { db }) {
  const token = String((req.query && req.query.t) || '');
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return res.status(404).send('Not found');
  const snap = await db.collection('calendarEvents').doc(token).get().catch(() => null);
  const d = snap && snap.exists ? snap.data() : null;
  if (!d || !d.ics || (d.expiresAt && d.expiresAt < Date.now())) return res.status(404).send('This link has expired.');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'inline; filename="datetoday-date.ics"');
  res.set('Cache-Control', 'private, max-age=300');
  return res.status(200).send(d.ics);
}

module.exports = {
  buildIcs,
  calendarEvent,
  createCalendarLink,
  eventFor,
  eventUidFor,
  googleCalendarUrl,
  icsEscape,
};
