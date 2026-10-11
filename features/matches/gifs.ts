import { functionsUrl, isChatGif, type ChatGif } from '@/features/matches/api';
import { getFirebaseAuth } from '@/lib/firebase/client';

export type GifPage = { gifs: ChatGif[]; next: number | null };

/** `chat` animates in a bubble; `thumb` is the lighter rendition for the picker grid. */
export function gifUrl(id: string, size: 'chat' | 'thumb' = 'chat'): string {
  return `https://media.giphy.com/media/${id}/${size === 'thumb' ? '200w_d' : '200w'}.webp`;
}

/** Trending when `query` is empty. */
export async function searchGifs(query: string, offset = 0, signal?: AbortSignal): Promise<GifPage> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const res = await fetch(functionsUrl('searchGifs'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query.trim(), offset }),
    signal,
  });
  const json = (await res.json().catch(() => ({}))) as { gifs?: unknown[]; next?: unknown; error?: string };
  if (!res.ok) throw new Error(json.error || 'Couldn’t load GIFs right now.');
  return {
    gifs: (json.gifs ?? []).filter(isChatGif),
    next: typeof json.next === 'number' ? json.next : null,
  };
}
