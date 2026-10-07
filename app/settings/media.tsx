import {
    ProfileMediaViewer,
    PromptVideoTile,
    type MediaViewerItem,
} from '@/components/profile/ProfileMediaViewer';
import { SettingsHeader } from '@/components/settings/SettingsUI';
import { AppText } from '@/components/ui/AppText';
import { Screen } from '@/components/ui/Screen';
import { colors, radii, spacing } from '@/constants/theme';
import { TONIGHT_SIGNATURE_PROMPT, getPromptById } from '@/constants/videoPrompts';
import { isBackendConfigured } from '@/lib/env';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';
import {
    describeUploadError,
    remoteMediaUrlOrNull,
    uploadLocalMedia,
} from '@/lib/firebase/uploadLocalMedia';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { ScaledSheet } from '@/lib/scale';
import { rememberPickSlot, useRecoverPickedImage } from '@/lib/pendingImagePick';

const MAX_PHOTOS = 3;

async function uploadSlot(uid: string, localUri: string, path: string, contentType: string) {
  return uploadLocalMedia(path, localUri, contentType);
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
    const remoteNext = next.map((u) => remoteMediaUrlOrNull(u)).filter(Boolean) as string[];
    const main = remoteNext[0] ?? remoteMediaUrlOrNull(next[0]) ?? null;
    setPhotos(next);
    draft.setMainPhotoUri(main ?? next[0] ?? null);
    if (profile) {
      setProfile({
        ...profile,
        mainPhotoUrl: main,
        photoUrls: remoteNext.length ? remoteNext : next,
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
          photoUrls: remoteNext,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await setDoc(
        doc(getDb(), 'profiles', uid),
        {
          mainPhotoUrl: main,
          photoUrls: remoteNext,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      void import('@/features/live/firestoreLive')
        .then(({ refreshLiveProfileFields }) =>
          refreshLiveProfileFields({ mainPhotoUrl: main, photoUrls: remoteNext }),
        )
        .catch(() => undefined);
    }
  };

  useRecoverPickedImage((uri, slot) => {
    const target = slot != null && slot < MAX_PHOTOS ? slot : Math.min(photos.length, MAX_PHOTOS - 1);
    setBusySlot(target);
    void uploadPhoto(target, uri)
      .catch(() => Alert.alert('Could not update photo'))
      .finally(() => setBusySlot(null));
  });

  const pickPhoto = async (slot: number) => {
    try {
      setBusySlot(slot);
      rememberPickSlot(slot);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.75,
        // iCloud "Optimize Storage" photos aren't on-device; without this iOS returns no usable file.
        shouldDownloadFromNetwork: true,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      await uploadPhoto(slot, result.assets[0].uri);
    } catch {
      Alert.alert('Could not update photo');
    } finally {
      setBusySlot(null);
    }
  };

  /** Upload first; the profile only ever receives the Storage download URL. */
  const uploadPhoto = async (slot: number, localUri: string) => {
    let url = localUri;
    const uid =
      useSessionStore.getState().userId ||
      (isBackendConfigured() ? getFirebaseAuth().currentUser?.uid : null);

    if (isBackendConfigured() && uid) {
      try {
        url = await uploadSlot(uid, localUri, `users/${uid}/photos/${slot}.jpg`, 'image/jpeg');
      } catch (error) {
        console.warn('[DateToday] photo upload failed', error);
        Alert.alert(
          'Photo upload failed',
          `${describeUploadError(error)}\n\nYour photo is still selected, so you won’t need to pick it again.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Try again',
              onPress: () => {
                setBusySlot(slot);
                void uploadPhoto(slot, localUri)
                  .catch(() => Alert.alert('Could not update photo'))
                  .finally(() => setBusySlot(null));
              },
            },
          ],
        );
        return;
      }
    }

    if (isBackendConfigured() && !remoteMediaUrlOrNull(url)) {
      Alert.alert('Photo upload failed', 'Check your connection and try again.');
      return;
    }

    const next = [...photos];
    while (next.length <= slot) next.push('');
    next[slot] = url;
    await persistPhotos(next.filter(Boolean).slice(0, MAX_PHOTOS));
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

const styles = ScaledSheet.create({
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
