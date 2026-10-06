import { getPromptById, TONIGHT_SIGNATURE_PROMPT } from '@/constants/videoPrompts';
import { isBackendConfigured } from '@/lib/env';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';
import {
  describeUploadError,
  remoteMediaUrlOrNull,
  uploadLocalMedia,
} from '@/lib/firebase/uploadLocalMedia';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

/** Firestore writes wait for the server ack; a stalled connection must surface as an error, not a spinner. */
const SAVE_TIMEOUT_MS = 20_000;

function confirmed<T>(write: Promise<T>): Promise<T> {
  return Promise.race([
    write,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('Couldn’t reach the server to save it. Check your connection and try again.')),
        SAVE_TIMEOUT_MS,
      ),
    ),
  ]);
}

async function uploadMedia(
  uid: string,
  localUri: string,
  path: string,
  contentType: string,
): Promise<string> {
  return uploadLocalMedia(path, localUri, contentType);
}

/**
 * Save one re-recorded prompt video from Settings: upload it, then write only that slot so a
 * missing or stale copy of the other video can't block or wipe it.
 */
export async function persistPromptVideoSlot(slot: 'about' | 'tonight', localUri: string): Promise<void> {
  if (!isBackendConfigured()) return;
  const uid =
    useSessionStore.getState().userId || getFirebaseAuth().currentUser?.uid || null;
  if (!uid) throw new Error('You are signed out. Sign in again, then retry.');

  let url: string;
  try {
    console.log(`[DateToday] Starting ${slot} video upload from ${localUri.slice(0, 100)}...`);
    url = await uploadMedia(uid, localUri, `users/${uid}/videos/${slot}.mp4`, 'video/mp4');
    console.log(`[DateToday] ${slot} video upload succeeded: ${url.slice(0, 100)}...`);
  } catch (error) {
    console.error(`[DateToday] ${slot} video upload failed:`, error);
    throw new Error(describeUploadError(error));
  }

  const draft = useOnboardingDraft.getState();
  const aboutPrompt = draft.aboutPromptId ? getPromptById(draft.aboutPromptId) : undefined;
  const fields =
    slot === 'about'
      ? {
          aboutPromptId: draft.aboutPromptId,
          aboutPromptText: aboutPrompt?.text ?? null,
          aboutVideoUrl: url,
        }
      : {
          tonightPromptId: TONIGHT_SIGNATURE_PROMPT.id,
          tonightPromptText: TONIGHT_SIGNATURE_PROMPT.text,
          tonightVideoUrl: url,
        };

  await confirmed(
    Promise.all([
      setDoc(doc(getDb(), 'users', uid), { ...fields, updatedAt: serverTimestamp() }, { merge: true }),
      setDoc(doc(getDb(), 'profiles', uid), { ...fields, updatedAt: serverTimestamp() }, { merge: true }),
    ]),
  );
  if (slot === 'about') draft.setAboutVideoUri(url);
  else draft.setTonightVideoUri(url);

  const profile = useSessionStore.getState().profile;
  if (profile) {
    const next = { ...profile, ...fields, updatedAt: new Date().toISOString() };
    useSessionStore.getState().setProfile({
      ...next,
      profileCompletion: {
        ...profile.profileCompletion,
        videos: Boolean(next.aboutVideoUrl && next.tonightVideoUrl),
      },
    });
  }

  void import('@/features/live/firestoreLive')
    .then(({ refreshLiveProfileFields }) => refreshLiveProfileFields(fields))
    .catch(() => undefined);
}

/**
 * Upload draft prompt videos (if local) and write URLs + caption text to users + profiles.
 */
export async function persistPromptVideosToAccount(): Promise<void> {
  if (!isBackendConfigured()) return;
  const uid =
    useSessionStore.getState().userId || getFirebaseAuth().currentUser?.uid || null;
  if (!uid) return;

  const draft = useOnboardingDraft.getState();
  let aboutVideoUrl = remoteMediaUrlOrNull(draft.aboutVideoUri) ?? draft.aboutVideoUri;
  let tonightVideoUrl = remoteMediaUrlOrNull(draft.tonightVideoUri) ?? draft.tonightVideoUri;
  let firstError: unknown = null;

  if (aboutVideoUrl && !remoteMediaUrlOrNull(aboutVideoUrl)) {
    try {
      aboutVideoUrl = await uploadMedia(
        uid,
        aboutVideoUrl,
        `users/${uid}/videos/about.mp4`,
        'video/mp4',
      );
      draft.setAboutVideoUri(aboutVideoUrl);
    } catch (error) {
      console.warn('[DateToday] about video upload failed', error);
      firstError ??= error;
      aboutVideoUrl = remoteMediaUrlOrNull(draft.aboutVideoUri);
    }
  }
  if (tonightVideoUrl && !remoteMediaUrlOrNull(tonightVideoUrl)) {
    try {
      tonightVideoUrl = await uploadMedia(
        uid,
        tonightVideoUrl,
        `users/${uid}/videos/tonight.mp4`,
        'video/mp4',
      );
      draft.setTonightVideoUri(tonightVideoUrl);
    } catch (error) {
      console.warn('[DateToday] tonight video upload failed', error);
      firstError ??= error;
      tonightVideoUrl = remoteMediaUrlOrNull(draft.tonightVideoUri);
    }
  }

  // Successful uploads are already stored in the draft; write nothing until every video is up,
  // otherwise a failed one would overwrite the previously saved URL with null.
  if (firstError) throw new Error(describeUploadError(firstError));

  aboutVideoUrl = remoteMediaUrlOrNull(aboutVideoUrl);
  tonightVideoUrl = remoteMediaUrlOrNull(tonightVideoUrl);

  const aboutPrompt = draft.aboutPromptId ? getPromptById(draft.aboutPromptId) : undefined;
  const payload = {
    aboutPromptId: draft.aboutPromptId,
    aboutPromptText: aboutPrompt?.text ?? null,
    aboutVideoUrl: aboutVideoUrl || null,
    tonightPromptId: TONIGHT_SIGNATURE_PROMPT.id,
    tonightPromptText: TONIGHT_SIGNATURE_PROMPT.text,
    tonightVideoUrl: tonightVideoUrl || null,
    updatedAt: serverTimestamp(),
  };

  await confirmed(
    Promise.all([
      setDoc(doc(getDb(), 'users', uid), payload, { merge: true }),
      setDoc(doc(getDb(), 'profiles', uid), payload, { merge: true }),
    ]),
  );

  const profile = useSessionStore.getState().profile;
  if (profile) {
    useSessionStore.getState().setProfile({
      ...profile,
      aboutPromptId: draft.aboutPromptId,
      aboutPromptText: aboutPrompt?.text ?? null,
      aboutVideoUrl: aboutVideoUrl || null,
      tonightPromptId: TONIGHT_SIGNATURE_PROMPT.id,
      tonightPromptText: TONIGHT_SIGNATURE_PROMPT.text,
      tonightVideoUrl: tonightVideoUrl || null,
      updatedAt: new Date().toISOString(),
      profileCompletion: {
        ...profile.profileCompletion,
        videos: Boolean(aboutVideoUrl && tonightVideoUrl),
      },
    });
  }
}
