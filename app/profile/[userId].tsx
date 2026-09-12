import React, { useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { CloseButton } from '@/components/ui/CloseButton';
import { VerificationTag } from '@/components/ui/VerificationTag';
import {
  ProfileMediaViewer,
  PromptVideoTile,
  type MediaViewerItem,
} from '@/components/profile/ProfileMediaViewer';
import { TONIGHT_SIGNATURE_PROMPT } from '@/constants/videoPrompts';
import { copy } from '@/constants/copy';
import { colors, radii, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { getDb } from '@/lib/firebase/client';
import { isBackendConfigured } from '@/lib/env';
import { calculateAge } from '@/utils/time';
import type { Profile } from '@/types';

const SCREEN_W = Dimensions.get('window').width;

function photosFromProfile(p: Profile | null | undefined): string[] {
  if (!p) return [];
  const list = (p.photoUrls ?? []).filter(Boolean).slice(0, 3);
  if (list.length) return list;
  return p.mainPhotoUrl ? [p.mainPhotoUrl] : [];
}

export default function PublicProfileScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const sessionUid = useSessionStore((s) => s.userId);
  const sessionProfile = useSessionStore((s) => s.profile);
  const isSelf = Boolean(
    userId && (userId === 'me' || userId === sessionUid || userId === sessionProfile?.userId),
  );

  const [remote, setRemote] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!isSelf);
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({
    open: false,
    index: 0,
  });

  React.useEffect(() => {
    let alive = true;
    async function load() {
      if (isSelf) {
        setLoading(false);
        return;
      }
      if (!userId || userId.startsWith('demo-') || !isBackendConfigured()) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        const snap = await getDoc(doc(getDb(), 'profiles', String(userId)));
        if (!alive) return;
        if (!snap.exists()) {
          setRemote(null);
          return;
        }
        const d = snap.data();
        const photoUrls = Array.isArray(d.photoUrls)
          ? (d.photoUrls as string[]).filter(Boolean).slice(0, 3)
          : d.mainPhotoUrl
            ? [String(d.mainPhotoUrl)]
            : [];
        setRemote({
          userId: String(userId),
          displayName: String(d.displayName ?? 'Member'),
          bio: (d.bio as string | null) ?? null,
          genderId: (d.gender as string | null) ?? null,
          datingIntention: (d.datingIntention as Profile['datingIntention']) ?? null,
          heightCm: typeof d.heightCm === 'number' ? d.heightCm : null,
          occupation: (d.occupation as string | null) ?? null,
          school: (d.school as string | null) ?? null,
          hometown: (d.hometown as string | null) ?? null,
          neighborhoodLabel: (d.neighborhoodLabel as string | null) ?? null,
          zodiac: null,
          pronouns: (d.pronouns as string | null) ?? null,
          drinking: (d.drinking as string | null) ?? null,
          smoking: (d.smoking as string | null) ?? null,
          interests: Array.isArray(d.interests) ? (d.interests as string[]) : null,
          foodPreference: (d.foodPreference as string | null) ?? null,
          verificationStatus:
            (d.verificationStatus as Profile['verificationStatus']) ?? 'unverified',
          mainPhotoUrl: (d.mainPhotoUrl as string | null) ?? photoUrls[0] ?? null,
          photoUrls,
          aboutPromptText: (d.aboutPromptText as string | null) ?? null,
          aboutVideoUrl: (d.aboutVideoUrl as string | null) ?? null,
          tonightPromptText: (d.tonightPromptText as string | null) ?? null,
          tonightVideoUrl: (d.tonightVideoUrl as string | null) ?? null,
          profileCompletion: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch {
        if (alive) setRemote(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [isSelf, userId]);

  const profile: Profile | null = isSelf ? sessionProfile : remote;
  const photos = photosFromProfile(profile);

  const age = useMemo(() => {
    if (!isSelf || !sessionProfile?.dateOfBirth) return null;
    try {
      return calculateAge(sessionProfile.dateOfBirth);
    } catch {
      return null;
    }
  }, [isSelf, sessionProfile?.dateOfBirth]);

  const aboutCaption = profile?.aboutPromptText || 'About You';
  const tonightCaption = profile?.tonightPromptText || TONIGHT_SIGNATURE_PROMPT.text;

  const viewerItems: MediaViewerItem[] = useMemo(() => {
    const items: MediaViewerItem[] = photos.map((uri) => ({ type: 'photo', uri }));
    if (profile?.aboutVideoUrl) {
      items.push({
        type: 'video',
        uri: profile.aboutVideoUrl,
        caption: aboutCaption,
        eyebrow: 'About You',
      });
    }
    if (profile?.tonightVideoUrl) {
      items.push({
        type: 'video',
        uri: profile.tonightVideoUrl,
        caption: tonightCaption,
        eyebrow: 'Tonight',
      });
    }
    return items;
  }, [photos, profile?.aboutVideoUrl, profile?.tonightVideoUrl, aboutCaption, tonightCaption]);

  const openAt = (index: number) => {
    if (!viewerItems.length) return;
    setViewer({ open: true, index });
  };

  if (loading) {
    return (
      <Screen>
        <AppText variant="secondary">Loading profile…</AppText>
      </Screen>
    );
  }

  if (!profile) {
    return (
      <Screen>
        <CloseButton onPress={() => router.back()} />
        <AppText variant="hero" style={{ marginTop: spacing.lg }}>
          Profile unavailable
        </AppText>
        <Button label="Back" onPress={() => router.back()} style={{ marginTop: spacing.lg }} />
      </Screen>
    );
  }

  const nameLine =
    age != null ? `${profile.displayName}, ${age}` : profile.displayName;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <CloseButton onPress={() => router.back()} floating={false} />
          {isSelf ? (
            <Pressable onPress={() => router.push('/settings/media')}>
              <AppText style={styles.editLink}>Edit media</AppText>
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Photo strip — same for self + others */}
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.heroPager}
        >
          {(photos.length ? photos : [null]).map((uri, i) => (
            <Pressable
              key={uri ?? `empty-${i}`}
              style={styles.heroPage}
              onPress={() => (uri ? openAt(i) : undefined)}
            >
              {uri ? (
                <Image source={{ uri }} style={styles.heroImg} />
              ) : (
                <View style={[styles.heroImg, styles.heroEmpty]}>
                  <AppText style={styles.heroEmptyLabel}>No photo</AppText>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
        {photos.length > 1 ? (
          <AppText style={styles.photoHint}>{photos.length} photos · tap to expand</AppText>
        ) : null}

        <View style={styles.body}>
          <AppText variant="hero">{nameLine}</AppText>
          <VerificationTag status={profile.verificationStatus} />
          <AppText variant="secondary">
            {[profile.hometown, profile.neighborhoodLabel].filter(Boolean).join(' · ') ||
              'Nearby'}
          </AppText>
          {profile.datingIntention ? (
            <AppText variant="caption">{String(profile.datingIntention).replace(/_/g, ' ')}</AppText>
          ) : null}

          {profile.interests?.length ? (
            <View style={styles.chips}>
              {profile.interests.map((a) => (
                <View key={a} style={styles.chip}>
                  <AppText variant="caption" style={styles.chipText}>
                    {a}
                  </AppText>
                </View>
              ))}
            </View>
          ) : null}

          {profile.bio ? (
            <>
              <AppText variant="label">About</AppText>
              <AppText>{profile.bio}</AppText>
            </>
          ) : null}

          <AppText variant="label" style={styles.section}>
            Video prompts
          </AppText>
          <View style={styles.videos}>
            <PromptVideoTile
              uri={profile.aboutVideoUrl}
              eyebrow="About You"
              caption={aboutCaption}
              onPress={() => {
                if (!profile.aboutVideoUrl) {
                  if (isSelf) router.push('/settings/media');
                  return;
                }
                openAt(photos.length);
              }}
            />
            <PromptVideoTile
              uri={profile.tonightVideoUrl}
              eyebrow="Tonight"
              caption={tonightCaption}
              onPress={() => {
                if (!profile.tonightVideoUrl) {
                  if (isSelf) router.push('/settings/media');
                  return;
                }
                openAt(photos.length + (profile.aboutVideoUrl ? 1 : 0));
              }}
            />
          </View>

          {!isSelf ? (
            <>
              <Button
                label={`♥ ${copy.interested}`}
                onPress={() =>
                  router.push({
                    pathname: '/mutual',
                    params: { name: profile.displayName },
                  })
                }
                style={styles.cta}
              />
              <Button
                label="Report / Block"
                variant="ghost"
                onPress={() =>
                  router.push({
                    pathname: '/safety/report',
                    params: { userId: String(userId), name: profile.displayName },
                  })
                }
              />
            </>
          ) : (
            <Button
              label="Edit profile"
              variant="secondary"
              onPress={() => router.push('/settings/edit-profile')}
              style={styles.cta}
            />
          )}
        </View>
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
    paddingBottom: spacing.xxl,
  },
  topBar: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editLink: {
    color: colors.white,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.45)',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  heroPager: {
    height: 420,
  },
  heroPage: {
    width: SCREEN_W,
    height: 420,
  },
  heroImg: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.card,
  },
  heroEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmptyLabel: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  photoHint: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 8,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: spacing.sm,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  chipText: {
    color: colors.textSecondary,
  },
  section: {
    marginTop: spacing.md,
  },
  videos: {
    gap: spacing.md,
  },
  cta: {
    marginTop: spacing.lg,
  },
});
