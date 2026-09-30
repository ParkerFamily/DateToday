import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import QUIZ from '@/functions/quizQuestions.json';
import { functionsUrl } from '@/features/matches/api';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';
import { useSessionStore } from '@/store/session';

export type QuizQuestion = {
  id: string;
  level: number;
  kind: 'scale' | 'pick';
  weight: number;
  text: string;
  options: string[];
};

export type QuizLevel = { level: number; name: string; blurb: string };
export type QuizAnswers = Record<string, number>;

export const QUIZ_LEVELS: QuizLevel[] = QUIZ.levels;
export const QUIZ_QUESTIONS = QUIZ.questions as QuizQuestion[];
export const MAX_QUIZ_LEVEL = QUIZ_LEVELS.length;

export function questionsForLevel(level: number) {
  return QUIZ_QUESTIONS.filter((q) => q.level === level);
}

export function levelName(level: number) {
  return QUIZ_LEVELS.find((l) => l.level === level)?.name ?? 'Quick';
}

function requireUid() {
  const uid = useSessionStore.getState().userId || getFirebaseAuth().currentUser?.uid;
  if (!uid) throw new Error('Sign in first.');
  return uid;
}

export async function loadMyQuiz(): Promise<{ answers: QuizAnswers; level: number }> {
  const snap = await getDoc(doc(getDb(), 'users', requireUid()));
  const quiz = snap.data()?.quiz as { answers?: QuizAnswers; level?: number } | undefined;
  return { answers: quiz?.answers ?? {}, level: Number(quiz?.level) || 0 };
}

/**
 * Answers stay on the private users doc; only the finished level goes on the public
 * profile so others can see there's a match % to unlock.
 */
export async function saveQuiz(answers: QuizAnswers, level: number) {
  const uid = requireUid();
  const db = getDb();
  await setDoc(
    doc(db, 'users', uid),
    { quiz: { answers, level, updatedAt: Date.now() }, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await setDoc(doc(db, 'profiles', uid), { quizLevel: level, updatedAt: serverTimestamp() }, { merge: true });
  compatCache.clear();
  void import('@/features/live/firestoreLive')
    .then((m) => m.refreshLiveProfileFields({ quizLevel: level }))
    .catch(() => undefined);
  const profile = useSessionStore.getState().profile;
  if (profile) useSessionStore.getState().setProfile({ ...profile, quizLevel: level });
}

export type Compatibility =
  | { available: false; missing: 'you' | 'them' }
  | {
      available: true;
      percent: number;
      headline: string;
      summary: string;
      level: number;
      levelName: string;
      myLevel: number;
      theirLevel: number;
    };

export async function fetchCompatibility(otherUid: string): Promise<Compatibility> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const res = await fetch(functionsUrl('getCompatibility'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ otherUid }),
  });
  const json = (await res.json().catch(() => ({}))) as Compatibility & { error?: string };
  if (!res.ok) throw new Error(json.error || 'Couldn’t check compatibility right now.');
  return json;
}

const compatCache = new Map<string, Promise<Compatibility>>();

/** Feed cards ask for the same people over and over — one request per person per quiz state. */
export function cachedCompatibility(otherUid: string, theirLevel: number): Promise<Compatibility> {
  const key = `${otherUid}:${theirLevel}`;
  let hit = compatCache.get(key);
  if (!hit) {
    hit = fetchCompatibility(otherUid);
    hit.catch(() => compatCache.delete(key));
    compatCache.set(key, hit);
  }
  return hit;
}
