import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';

/** Mirrors appConfig/priorityLikes; the server enforces the real limits. */
export type PriorityLikeConfig = { enabled: boolean; noteMaxChars: number; dailyLimit: number };

export const PRIORITY_LIKE_DEFAULTS: PriorityLikeConfig = { enabled: true, noteMaxChars: 80, dailyLimit: 5 };

export const PRIORITY_NOTE_IDEAS = ['Drinks tonight?', 'You seem exactly my vibe.', 'Dinner later?'];

let cached: PriorityLikeConfig | null = null;

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export async function loadPriorityLikeConfig(): Promise<PriorityLikeConfig> {
  if (cached) return cached;
  try {
    const snap = await getDoc(doc(getDb(), 'appConfig', 'priorityLikes'));
    const d = snap.exists() ? snap.data() : {};
    cached = {
      enabled: d.enabled !== false,
      noteMaxChars: clamp(d.noteMaxChars, 20, 200, PRIORITY_LIKE_DEFAULTS.noteMaxChars),
      dailyLimit: clamp(d.dailyLimit, 1, 50, PRIORITY_LIKE_DEFAULTS.dailyLimit),
    };
  } catch {
    return PRIORITY_LIKE_DEFAULTS;
  }
  return cached;
}

/** Instant feedback while typing; null when it looks sendable. */
export function priorityNoteProblem(note: string, maxChars: number): string | null {
  const text = note.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if ([...text].length > maxChars) return `Keep your note to ${maxChars} characters.`;
  if (/(https?:\/\/|www\.)|\b[a-z0-9-]{2,}\.(com|net|org|io|co|me|app|ly|gg|link)\b|\S+@\S+\.\w{2,}|(^|\s)@\w{2,}/i.test(text)) {
    return 'Notes can’t include links, emails or social handles.';
  }
  if (/(\d[\s().+-]*){7,}/.test(text)) return 'Notes can’t include phone numbers.';
  return null;
}
