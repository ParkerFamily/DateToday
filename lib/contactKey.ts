/**
 * Block contacts sends only SHA-256 hashes of these keys. They must match functions/contactBlocks.js
 * (and canonicalEmail in functions/emailIdentity.js) character for character, or nobody matches.
 */
const GMAIL = new Set(['gmail.com', 'googlemail.com']);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function canonicalEmail(email: string): string {
  const address = String(email || '').trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at < 1) return address;
  let local = address.slice(0, at).split('+')[0];
  let domain = address.slice(at + 1);
  if (GMAIL.has(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

export function phoneDigits(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function contactKey(kind: 'phone' | 'email', raw: string): string | null {
  if (kind === 'phone') {
    const digits = phoneDigits(raw);
    return digits ? `p:${digits}` : null;
  }
  const email = canonicalEmail(raw);
  return EMAIL_RE.test(email) ? `e:${email}` : null;
}

/** What someone typed: an email if it has an @, otherwise a phone number. */
export function typedContactKey(raw: string): string | null {
  return raw.includes('@') ? contactKey('email', raw) : contactKey('phone', raw);
}

/** "•••• 4567" / "j•••@gmail.com": enough to recognise an entry without storing the whole thing. */
export function maskContact(raw: string): string {
  const s = raw.trim();
  if (s.includes('@')) {
    const email = canonicalEmail(s);
    const at = email.indexOf('@');
    return `${email.slice(0, 1)}•••${email.slice(at)}`;
  }
  const digits = s.replace(/\D/g, '');
  return `•••• ${digits.slice(-4)}`;
}
