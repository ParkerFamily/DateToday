export type LikesMeterTone = 'plus' | 'calm' | 'notice' | 'low' | 'out';

export type LikesMeter = { tone: LikesMeterTone; label: string; a11y: string };

/**
 * The free-Likes counter in Discover. Gets louder as the starter allowance runs down:
 * 10+ just the number, 4–9 tinted, 1–3 "Almost out", 0 an upgrade CTA. DateToday+ sees
 * "Unlimited Likes". Null when there's nothing to show (still loading, or the cap is off).
 */
export function likesMeter(left: number | null | undefined, plus: boolean): LikesMeter | null {
  if (plus) return { tone: 'plus', label: 'Unlimited Likes', a11y: 'DateToday+: unlimited Likes' };
  if (left == null || !Number.isFinite(left)) return null;
  const n = Math.max(0, Math.floor(left));
  if (n === 0) {
    return { tone: 'out', label: 'Out of free Likes · Upgrade', a11y: 'You’re out of free Likes. Upgrade to keep liking' };
  }
  const word = n === 1 ? 'Like' : 'Likes';
  if (n <= 3) return { tone: 'low', label: `Almost out · ${n} ${word} left`, a11y: `Almost out: ${n} free ${word} left` };
  return { tone: n <= 9 ? 'notice' : 'calm', label: `${n} free ${word} left`, a11y: `${n} free ${word} left` };
}
