import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import {
  ProfileMediaViewer,
  PromptVideoTile,
  type MediaViewerItem,
} from '@/components/profile/ProfileMediaViewer';
import { TONIGHT_SIGNATURE_PROMPT, getPromptById } from '@/constants/videoPrompts';
import { colors, radii, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { getFirebaseAuth, getDb, getFirebaseStorage } from '@/lib/firebase/client';
import { isBackendConfigured } from '@/lib/env';

const MAX_PHOTOS = 3;

async function uploadSlot(uid: string, localUri: string, path: string, contentType: string) {
  if (localUri.startsWith('http://') || localUri.startsWith('https://')) return localUri;
  const storage = getFirebaseStorage();
  const objectRef = ref(storage, path);
  const response = await fetch(localUri);
  const blob = await response.blob();
  await uploadBytes(objectRef, blob, { contentType });
  return getDownloadURL(objectRef);
}

function normalizePhotos(profilePhotos: string[] | undefined, main: string | null | undefined) {
  const list = (profilePhotos ?? []).filter(Boolean).slice(0, MAX_PHOTOS);
  if (list.length) return list;
  return main ? [main] : [];
}

export default function MediaSettingsScreen() {
  const router = useRouter();
  const profile = useSessionStore((s) => s.profile);
  const setProfile = useSessionStore((s) => s.setProfile);
  const draft = useOnboardingDraft();

  const [photos, setPhotos] = useState<string[]>(() =>
    normalizePhotos(profile?.photoUrls, profile?.mainPhotoUrl ?? draft.mainPhotoUri),
  );
  const [aboutUri, setAboutUri] = useState(
    profile?.aboutVideoUrl ?? draft.aboutVideoUri ?? null,
  );
  const [tonightUri, setTonightUri] = useState(
    profile?.tonightVideoUrl ?? draft.tonightVideoUri ?? null,
  );
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });

  const aboutCaption =
    profile?.aboutPromptText ||
    (draft.aboutPromptId ? getPromptById(draft.aboutPromptId)?.text : null) ||
    'About You prompt';
  const tonightCaption = profile?.tonightPromptText || TONIGHT_SIGNATURE_PROMPT.text;

  const viewerItems: MediaViewerItem[] = useMemo(() => {
    const items: MediaViewerItem[] = photos.map((uri) => ({ type: 'photo', uri }));
    if (aboutUri) {
      items.push({
        type: 'video',
        uri: aboutUri,
        caption: aboutCaption,
        eyebrow: 'About You',
      });
    }
    if (tonightUri) {
      items.push({
        type: 'video',
        uri: tonightUri,
        caption: tonightCaption,
        eyebrow: 'Tonight',
      });
    }
    return items;
  }, [photos, aboutUri, tonightUri, aboutCaption, tonightCaption]);

  const persistPhotos = async (next: string[]) => {
    const uid =
      useSessionStore.getState().userId ||
      (isBackendConfigured() ? getFirebaseAuth().currentUser?.uid : null);
    const main = next[0] ?? null;
    setPhotos(next);
    draft.setMainPhotoUri(main);
    if (profile) {
      setProfile({
        ...profile,
        mainPhotoUrl: main,
        photoUrls: next,
        updatedAt: new Date().toISOString(),
        profileCompletion: {
          ...profile.profileCompletion,
          mainPhoto: Boolean(main),
        },
      });
    }
    if (isBackendConfigured() && uid) {
      await setDoc(
        doc(getDb(), 'users', uid),
        {
          mainPhotoUrl: main,
          photoUrls: next,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await setDoc(
        doc(getDb(), 'profiles', uid),
        {
          mainPhotoUrl: main,
          photoUrls: next,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
  };

  const pickPhoto = async (slot: number) => {
    try {
      setBusySlot(slot);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]?.uri) return;

      let url = result.assets[0].uri;
      const uid =
        useSessionStore.getState().userId ||
        (isBackendConfigured() ? getFirebaseAuth().currentUser?.uid : null);

      if (isBackendConfigured() && uid) {
        try {
          url = await uploadSlot(uid, url, `users/${uid}/photos/${slot}.jpg`, 'image/jpeg');
        } catch {
          // Keep local URI if Storage upload fails.
        }
      }

      const next = [...photos];
      while (next.length <= slot) next.push('');
      next[slot] = url;
      await persistPhotos(next.filter(Boolean).slice(0, MAX_PHOTOS));
    } catch {
      Alert.alert('Could not update photo');
    } finally {
      setBusySlot(null);
    }
  };

  const removePhoto = (slot: number) => {
    Alert.alert('Remove photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void persistPhotos(photos.filter((_, i) => i !== slot));
        },
      },
    ]);
  };

  const openViewerAt = (index: number) => {
    if (!viewerItems.length) return;
    setViewer({ open: true, index });
  };

  const videoViewerIndex = (kind: 'about' | 'tonight') => {
    const photoCount = photos.length;
    if (kind === 'about') return aboutUri ? photoCount : 0;
    return photoCount + (aboutUri ? 1 : 0);
  };

  // Sync session media into local draft so re-record / return flow works.
  React.useEffect(() => {
    if (profile?.aboutVideoUrl && !draft.aboutVideoUri) {
      draft.setAboutVideoUri(profile.aboutVideoUrl);
    }
    if (profile?.tonightVideoUrl && !draft.tonightVideoUri) {
      draft.setTonightVideoUri(profile.tonightVideoUrl);
    }
    if (profile?.aboutPromptId && !draft.aboutPromptId) {
      draft.setAboutPromptId(profile.aboutPromptId);
    }
  }, []);

  React.useEffect(() => {
    if (draft.aboutVideoUri) setAboutUri(draft.aboutVideoUri);
    if (draft.tonightVideoUri) setTonightUri(draft.tonightVideoUri);
  }, [draft.aboutVideoUri, draft.tonightVideoUri]);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SettingsHeader title="Photos & videos" />
        <AppText variant="secondary" style={styles.lead}>
          Add up to 3 photos. Record your About You + Tonight prompts — preview them the same way
          others will.
        </AppText>

        <AppText variant="label" style={styles.sectionLabel}>
          Photos · {photos.length}/{MAX_PHOTOS}
        </AppText>
        <View style={styles.photoRow}>
          {Array.from({ length: MAX_PHOTOS }).map((_, slot) => {
            const uri = photos[slot];
            const busy = busySlot === slot;
            return (
              <Pressable
                key={slot}
                style={styles.photoSlot}
                onPress={() => (uri ? openViewerAt(slot) : void pickPhoto(slot))}
                onLongPress={() => (uri ? removePhoto(slot) : undefined)}
              >
                {uri ? (
                  <Image source={{ uri }} style={styles.photoImg} />
                ) : (
                  <View style={styles.photoEmpty}>
                    {busy ? (
                      <ActivityIndicator color={colors.brandBright} />
                    ) : (
                      <AppText style={styles.plus}>+</AppText>
                    )}
                  </View>
                )}
                {slot === 0 ? (
                  <View style={styles.mainBadge}>
                    <AppText style={styles.mainBadgeText}>Main</AppText>
                  </View>
                ) : null}
                {uri ? (
                  <Pressable style={styles.swapBtn} hitSlop={8} onPress={() => void pickPhoto(slot)}>
                    <AppText style={styles.swapText}>Change</AppText>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <AppText style={styles.hint}>Tap to preview · Long-press to remove · First slot is main</AppText>

        <AppText variant="label" style={styles.sectionLabel}>
          Video prompts
        </AppText>

        <View style={styles.videoBlock}>
          <View style={styles.videoHeader}>
            <AppText style={styles.videoTitle}>About You</AppText>
            <Pressable onPress={() => router.push('/(onboarding)/video-pick?from=settings')}>
              <AppText style={styles.link}>{aboutUri ? 'Re-record' : 'Record'}</AppText>
            </Pressable>
          </View>
          <PromptVideoTile
            uri={aboutUri}
            eyebrow="About You"
            caption={aboutCaption}
            onPress={() =>
              aboutUri
                ? openViewerAt(videoViewerIndex('about'))
                : router.push('/(onboarding)/video-pick?from=settings')
            }
          />
        </View>

        <View style={styles.videoBlock}>
          <View style={styles.videoHeader}>
            <AppText style={styles.videoTitle}>Tonight</AppText>
            <Pressable
              onPress={() =>
                router.push('/(onboarding)/video-record?slot=tonight&from=settings')
              }
            >
              <AppText style={styles.link}>{tonightUri ? 'Re-record' : 'Record'}</AppText>
            </Pressable>
          </View>
          <PromptVideoTile
            uri={tonightUri}
            eyebrow="Tonight"
            caption={tonightCaption}
            onPress={() =>
              tonightUri
                ? openViewerAt(videoViewerIndex('tonight'))
                : router.push('/(onboarding)/video-record?slot=tonight&from=settings')
            }
          />
        </View>

        <Pressable
          style={styles.previewAll}
          onPress={() => openViewerAt(0)}
          disabled={!viewerItems.length}
        >
          <AppText style={styles.previewAllText}>
            Preview profile media →
          </AppText>
        </Pressable>
      </ScrollView>

      <ProfileMediaViewer
        visible={viewer.open}
        items={viewerItems}
        initialIndex={viewer.index}
        onClose={() => setViewer({ open: false, index: 0 })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  lead: {
    lineHeight: 20,
  },
  sectionLabel: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  photoSlot: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  photoEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    color: colors.textSecondary,
    fontSize: 28,
    fontWeight: '300',
  },
  mainBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  mainBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  swapBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  swapText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: -4,
  },
  videoBlock: {
    gap: 10,
  },
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  videoTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    color: colors.brandBright,
    fontWeight: '700',
    fontSize: 14,
  },
  previewAll: {
    marginTop: spacing.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  previewAllText: {
    color: colors.brandBright,
    fontWeight: '700',
  },
});
