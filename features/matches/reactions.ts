/** Must match REACTIONS in functions/chat.js and the list in firestore.rules. */
export const MESSAGE_REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👍'] as const;

export type MessageReaction = (typeof MESSAGE_REACTIONS)[number];

export const LIKE_REACTION: MessageReaction = '❤️';

export function isMessageReaction(value: unknown): value is MessageReaction {
  return typeof value === 'string' && (MESSAGE_REACTIONS as readonly string[]).includes(value);
}

/** Valid reactions only, keyed by who reacted. */
export function parseReactions(raw: unknown): Record<string, MessageReaction> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, MessageReaction> = {};
  for (const [uid, emoji] of Object.entries(raw as Record<string, unknown>)) {
    if (isMessageReaction(emoji)) out[uid] = emoji;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Stable key so a memoized row only re-renders when its reactions actually change. */
export function reactionsKey(reactions: Record<string, string> | undefined): string {
  if (!reactions) return '';
  return Object.keys(reactions)
    .sort()
    .map((uid) => `${uid}:${reactions[uid]}`)
    .join('|');
}
