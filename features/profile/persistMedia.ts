import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseAuth, getDb, getFirebaseStorage } from '@/lib/firebase/client';
import { isBackendConfigured } from '@/lib/env';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { getPromptById, TONIGHT_SIGNATURE_PROMPT } from '@/constants/videoPrompts';

async function uploadMedia(
  uid: string,
  localUri: string,
  path: string,
  contentType: string,
): Promise<string> {
  if (localUri.startsWith('http://') || localUri.startsWith('https://')) return localUri;
  const storage = getFirebaseStorage();
  const objectRef = ref(storage, path);
  const response = await fetch(localUri);
  const blob = await response.blob();
  await uploadBytes(objectRef, blob, { contentType });
  return getDownloadURL(objectRef);
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
  let aboutVideoUrl = draft.aboutVideoUri;
  let tonightVideoUrl = draft.tonightVideoUri;

  if (aboutVideoUrl) {
    try {
      aboutVideoUrl = await uploadMedia(
        uid,
        aboutVideoUrl,
        `users/${uid}/videos/about.mp4`,
        'video/mp4',
      );
      draft.setAboutVideoUri(aboutVideoUrl);
    } catch {
      /* keep local */
    }
  }
  if (tonightVideoUrl) {
    try {
      tonightVideoUrl = await uploadMedia(
        uid,
        tonightVideoUrl,
        `users/${uid}/videos/tonight.mp4`,
        'video/mp4',
      );
      draft.setTonightVideoUri(tonightVideoUrl);
    } catch {
      /* keep local */
    }
  }

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

  await setDoc(doc(getDb(), 'users', uid), payload, { merge: true });
  await setDoc(doc(getDb(), 'profiles', uid), payload, { merge: true });

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
