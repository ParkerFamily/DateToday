import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { OptionChip } from '@/components/ui/OptionChip';
import { VerificationTag } from '@/components/ui/VerificationTag';
import { datingVibes, interestOptions } from '@/constants/copy';
import { FOOD_CUISINES, foodLabel, type FoodCuisine } from '@/constants/tonightVibe';
import { colors, radii, spacing } from '@/constants/theme';
import { useSessionStore } from '@/store/session';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { getFirebaseAuth, getDb } from '@/lib/firebase/client';
import { isBackendConfigured } from '@/lib/env';
import { calculateAge } from '@/utils/time';
import type { DatingIntention, InterestOption, Profile } from '@/types';

type Gender = 'woman' | 'man' | 'nonbinary';
type SheetId =
  | 'name'
  | 'birthday'
  | 'gender'
  | 'pronouns'
  | 'height'
  | 'hometown'
  | 'bio'
  | 'work'
  | 'school'
  | 'interests'
  | 'openTo'
  | 'vibe'
  | 'food'
  | 'drinking'
  | 'smoking'
  | null;

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Non-binary' },
];

const PRONOUNS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'ask me'];
const DRINKING = ['Never', 'Sometimes', 'Socially', 'Often'];
const SMOKING = ['Never', 'Sometimes', 'Socially', 'Often'];
const INTEREST_CHIPS = [
  'Music',
  'Foodie',
  'Fitness',
  'Art',
  'Travel',
  'Nightlife',
  'Outdoors',
  'Gaming',
  'Fashion',
  'Sports',
  'Film',
  'Reading',
];

function genderLabel(value: string | null | undefined) {
  return GENDERS.find((g) => g.value === value)?.label ?? null;
}

function cmToHeightLabel(cm: number | null | undefined) {
  if (!cm || cm < 120) return null;
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

function heightLabelToCm(label: string): number | null {
  const m = /^(\d+)'\s*(\d+)"?$/.exec(label.trim());
  if (!m) return null;
  return Math.round((Number(m[1]) * 12 + Number(m[2])) * 2.54);
}

const HEIGHT_OPTIONS = (() => {
  const rows: string[] = [];
  for (let feet = 4; feet <= 7; feet += 1) {
    for (let inches = 0; inches <= 11; inches += 1) {
      if (feet === 4 && inches < 10) continue;
      if (feet === 7 && inches > 2) continue;
      rows.push(`${feet}'${inches}"`);
    }
  }
  return rows;
})();

function vibeLabel(value: DatingIntention | null | undefined) {
  if (!value) return null;
  return datingVibes.find((v) => v.value === value)?.label ?? value;
}

function EditorRow({
  label,
  value,
  placeholder = 'Add',
  onPress,
  last,
  multilinePreview,
}: {
  label: string;
  value?: string | null;
  placeholder?: string;
  onPress: () => void;
  last?: boolean;
  multilinePreview?: boolean;
}) {
  const empty = !value?.trim();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, last && styles.rowLast, pressed && styles.rowPressed]}
    >
      <View style={styles.rowMain}>
        <AppText style={styles.rowLabel}>{label}</AppText>
        <AppText
          style={[
            styles.rowValue,
            empty && styles.rowPlaceholder,
            multilinePreview && styles.rowValueMulti,
          ]}
          numberOfLines={multilinePreview ? 2 : 1}
        >
          {empty ? placeholder : value}
        </AppText>
      </View>
      <AppText style={styles.chevron}>›</AppText>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="label" style={styles.sectionTitle}>
        {title}
      </AppText>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useSessionStore((s) => s.profile);
  const setProfile = useSessionStore((s) => s.setProfile);
  const preferences = useSessionStore((s) => s.preferences);
  const setPreferences = useSessionStore((s) => s.setPreferences);
  const draft = useOnboardingDraft();

  const [displayName, setDisplayName] = useState(
    profile?.displayName || draft.displayName || '',
  );
  const [bio, setBio] = useState(profile?.bio || draft.bio || '');
  const [gender, setGender] = useState<Gender | null>(
    (profile?.genderId as Gender | null) || draft.gender,
  );
  const [birthday, setBirthday] = useState(
    profile?.dateOfBirth || draft.dateOfBirth || '',
  );
  const [pronouns, setPronouns] = useState(profile?.pronouns || '');
  const [heightCm, setHeightCm] = useState<number | null>(profile?.heightCm ?? null);
  const [hometown, setHometown] = useState(profile?.hometown || '');
  const [occupation, setOccupation] = useState(profile?.occupation || '');
  const [school, setSchool] = useState(profile?.school || '');
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [interestedIn, setInterestedIn] = useState<InterestOption>(
    preferences?.interestedIn ?? draft.interestedIn ?? 'everyone',
  );
  const [vibe, setVibe] = useState<DatingIntention | null>(
    preferences?.intentions?.[0] ??
      profile?.datingIntention ??
      draft.vibes[0] ??
      null,
  );
  const [foodPreference, setFoodPreference] = useState<FoodCuisine | null>(
    (profile?.foodPreference as FoodCuisine | null) ?? null,
  );
  const [drinking, setDrinking] = useState(profile?.drinking || '');
  const [smoking, setSmoking] = useState(profile?.smoking || '');
  const [sheet, setSheet] = useState<SheetId>(null);
  const [draftText, setDraftText] = useState('');
  const [saving, setSaving] = useState(false);

  const age = useMemo(() => {
    if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
    try {
      return calculateAge(birthday);
    } catch {
      return null;
    }
  }, [birthday]);

  const completion = useMemo(() => {
    const checks = [
      displayName.trim().length >= 2,
      Boolean(gender),
      Boolean(birthday),
      Boolean(profile?.mainPhotoUrl || draft.mainPhotoUri),
      Boolean(bio.trim()),
      Boolean(heightCm),
      Boolean(hometown.trim()),
      Boolean(vibe),
      Boolean(interestedIn),
      interests.length > 0,
    ];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  }, [
    displayName,
    gender,
    birthday,
    profile?.mainPhotoUrl,
    draft.mainPhotoUri,
    bio,
    heightCm,
    hometown,
    vibe,
    interestedIn,
    interests.length,
  ]);

  const photoUri = profile?.mainPhotoUrl || draft.mainPhotoUri;
  const locationLine =
    hometown.trim() ||
    profile?.neighborhoodLabel ||
    (draft.locationEnabled ? 'Nearby' : null);

  const openTextSheet = (id: SheetId, initial: string) => {
    setDraftText(initial);
    setSheet(id);
  };

  const commitTextSheet = () => {
    const value = draftText.trim();
    if (sheet === 'name') {
      if (value.length < 2) {
        Alert.alert('Display name', 'Enter at least 2 characters.');
        return;
      }
      setDisplayName(value);
    } else if (sheet === 'birthday') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        Alert.alert('Birthday', 'Use YYYY-MM-DD.');
        return;
      }
      try {
        if (calculateAge(value) < 18) {
          Alert.alert('Birthday', 'You must be 18+.');
          return;
        }
      } catch {
        Alert.alert('Birthday', 'Enter a valid date.');
        return;
      }
      setBirthday(value);
    } else if (sheet === 'bio') setBio(value);
    else if (sheet === 'hometown') setHometown(value);
    else if (sheet === 'work') setOccupation(value);
    else if (sheet === 'school') setSchool(value);
    setSheet(null);
  };

  const persistAll = async () => {
    const name = displayName.trim();
    if (name.length < 2) {
      Alert.alert('Display name', 'Enter at least 2 characters.');
      return false;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const uid =
        useSessionStore.getState().userId ||
        (isBackendConfigured() ? getFirebaseAuth().currentUser?.uid : null);

      const next: Profile = {
        ...(profile ?? {
          userId: uid ?? 'local',
          datingIntention: null,
          neighborhoodLabel: null,
          zodiac: null,
          verificationStatus: 'unverified',
          mainPhotoUrl: null,
          profileCompletion: {},
          createdAt: nowIso,
        }),
        userId: uid ?? profile?.userId ?? 'local',
        displayName: name,
        bio: bio.trim() || null,
        dateOfBirth: birthday || profile?.dateOfBirth || null,
        genderId: gender,
        datingIntention: vibe,
        heightCm,
        occupation: occupation.trim() || null,
        school: school.trim() || null,
        hometown: hometown.trim() || null,
        pronouns: pronouns || null,
        drinking: drinking || null,
        smoking: smoking || null,
        interests: interests.length ? interests : null,
        foodPreference: foodPreference,
        updatedAt: nowIso,
        profileCompletion: {
          ...(profile?.profileCompletion ?? {}),
          name: true,
          ...(gender ? { gender: true } : {}),
          ...(birthday ? { age: true } : {}),
          ...(bio.trim() ? { bio: true } : {}),
        },
      };

      setProfile(next);
      draft.setDisplayName(name);
      draft.setBio(bio.trim());
      if (gender) draft.setGender(gender);
      if (birthday) draft.setDateOfBirth(birthday);
      if (vibe) useOnboardingDraft.setState({ vibes: [vibe] });
      draft.setInterestedIn(interestedIn);

      const prefs = {
        userId: uid ?? preferences?.userId ?? 'local',
        interestedIn,
        minAge: preferences?.minAge ?? draft.minAge ?? 18,
        maxAge: preferences?.maxAge ?? draft.maxAge ?? 35,
        maxDistanceMiles: preferences?.maxDistanceMiles ?? draft.radiusMiles ?? 10,
        intentions: vibe ? [vibe] : preferences?.intentions ?? [],
      };
      setPreferences(prefs);

      if (isBackendConfigured() && uid) {
        const userPayload = {
          displayName: name,
          bio: next.bio,
          gender,
          dateOfBirth: next.dateOfBirth,
          heightCm,
          occupation: next.occupation,
          school: next.school,
          hometown: next.hometown,
          pronouns: next.pronouns,
          drinking: next.drinking,
          smoking: next.smoking,
          interests: next.interests,
          foodPreference: next.foodPreference,
          datingIntention: vibe,
          vibes: vibe ? [vibe] : [],
          interestedIn,
          updatedAt: serverTimestamp(),
        };
        const profilePayload = {
          displayName: name,
          bio: next.bio,
          gender,
          heightCm,
          occupation: next.occupation,
          school: next.school,
          hometown: next.hometown,
          pronouns: next.pronouns,
          drinking: next.drinking,
          smoking: next.smoking,
          interests: next.interests,
          foodPreference: next.foodPreference,
          datingIntention: vibe,
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(getDb(), 'users', uid), userPayload, { merge: true });
        await setDoc(doc(getDb(), 'profiles', uid), profilePayload, { merge: true });
      }

      return true;
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onDone = async () => {
    const ok = await persistAll();
    if (ok) router.back();
  };

  const sheetTitle = (() => {
    switch (sheet) {
      case 'name':
        return 'Display name';
      case 'birthday':
        return 'Birthday';
      case 'gender':
        return 'Gender';
      case 'pronouns':
        return 'Pronouns';
      case 'height':
        return 'Height';
      case 'hometown':
        return 'Hometown';
      case 'bio':
        return 'Bio';
      case 'work':
        return 'Work';
      case 'school':
        return 'School';
      case 'interests':
        return 'Interests';
      case 'openTo':
        return 'What I’m open to';
      case 'vibe':
        return 'Perfect night out';
      case 'food':
        return 'Food I’m into';
      case 'drinking':
        return 'Drinking';
      case 'smoking':
        return 'Smoking';
      default:
        return '';
    }
  })();

  const isTextSheet =
    sheet === 'name' ||
    sheet === 'birthday' ||
    sheet === 'bio' ||
    sheet === 'hometown' ||
    sheet === 'work' ||
    sheet === 'school';

  return (
    <Screen padded={false}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={12}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.topBtn, pressed && styles.pressed]}
        >
          <AppText style={styles.backGlyph}>‹</AppText>
        </Pressable>
        <View style={styles.topCenter}>
          <AppText style={styles.topTitle}>Edit profile</AppText>
          <AppText style={styles.topSub}>This is how people see you</AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          hitSlop={12}
          disabled={saving}
          onPress={() => void onDone()}
          style={({ pressed }) => [styles.topBtn, styles.topBtnRight, pressed && styles.pressed]}
        >
          {saving ? (
            <ActivityIndicator color={colors.brandBright} size="small" />
          ) : (
            <AppText style={styles.doneLabel}>Done</AppText>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppText style={styles.completion}>{completion}% complete</AppText>

        <View style={styles.preview}>
          <View style={styles.photoWrap}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} />
            ) : (
              <View style={styles.photoEmpty}>
                <AppText style={styles.photoEmptyLabel}>Add photo</AppText>
              </View>
            )}
          </View>
          <View style={styles.previewMeta}>
            <View style={styles.nameRow}>
              <AppText style={styles.previewName} numberOfLines={1}>
                {displayName.trim() || 'Your name'}
                {age != null ? `, ${age}` : ''}
              </AppText>
            </View>
            <VerificationTag status={profile?.verificationStatus} compact />
            {locationLine ? (
              <AppText style={styles.previewPlace} numberOfLines={1}>
                {locationLine}
              </AppText>
            ) : (
              <AppText style={styles.previewPlaceMuted}>Location not set</AppText>
            )}
            <Pressable
              onPress={() =>
                router.push(`/profile/${profile?.userId ?? useSessionStore.getState().userId ?? 'me'}`)
              }
              style={({ pressed }) => [styles.previewLink, pressed && styles.pressed]}
            >
              <AppText style={styles.previewLinkText}>Preview profile</AppText>
              <AppText style={styles.previewLinkText}>→</AppText>
            </Pressable>
          </View>
        </View>

        <Section title="Basics">
          <EditorRow
            label="Display name"
            value={displayName}
            onPress={() => openTextSheet('name', displayName)}
          />
          <EditorRow
            label="Birthday"
            value={age != null ? `${age} · ${birthday}` : birthday || null}
            placeholder="Confirm 18+"
            onPress={() => openTextSheet('birthday', birthday)}
          />
          <EditorRow
            label="Gender"
            value={genderLabel(gender)}
            onPress={() => setSheet('gender')}
          />
          <EditorRow
            label="Pronouns"
            value={pronouns || null}
            onPress={() => setSheet('pronouns')}
          />
          <EditorRow
            label="Height"
            value={cmToHeightLabel(heightCm)}
            onPress={() => setSheet('height')}
          />
          <EditorRow
            label="Hometown"
            value={hometown || null}
            last
            onPress={() => openTextSheet('hometown', hometown)}
          />
        </Section>

        <Section title="About me">
          <EditorRow
            label="Bio"
            value={bio || null}
            placeholder="Write a little about you"
            multilinePreview
            onPress={() => openTextSheet('bio', bio)}
          />
          <EditorRow
            label="Work"
            value={occupation || null}
            onPress={() => openTextSheet('work', occupation)}
          />
          <EditorRow
            label="School"
            value={school || null}
            onPress={() => openTextSheet('school', school)}
          />
          <EditorRow
            label="Interests"
            value={interests.length ? interests.slice(0, 3).join(', ') : null}
            last
            onPress={() => setSheet('interests')}
          />
        </Section>

        <Section title="Your vibe">
          <EditorRow
            label="What I’m open to"
            value={interestOptions.find((o) => o.value === interestedIn)?.label}
            onPress={() => setSheet('openTo')}
          />
          <EditorRow
            label="Perfect night out"
            value={vibeLabel(vibe)}
            onPress={() => setSheet('vibe')}
          />
          <EditorRow
            label="Food I’m into"
            value={foodPreference ? foodLabel(foodPreference) : null}
            onPress={() => setSheet('food')}
          />
          <EditorRow
            label="Drinking"
            value={drinking || null}
            onPress={() => setSheet('drinking')}
          />
          <EditorRow
            label="Smoking"
            value={smoking || null}
            last
            onPress={() => setSheet('smoking')}
          />
        </Section>

        <Section title="Photos & video">
          <EditorRow
            label="Manage photos"
            value={photoUri ? 'Photo added' : null}
            placeholder="Add your main photo"
            onPress={() => router.push('/settings/media')}
          />
          <EditorRow
            label="Video prompt"
            value={null}
            placeholder="Record About You + Tonight"
            last
            onPress={() => router.push('/settings/media')}
          />
        </Section>
      </ScrollView>

      <Modal visible={sheet != null} animationType="slide" transparent onRequestClose={() => setSheet(null)}>
        <View style={styles.sheetRoot}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSheet(null)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <AppText style={styles.sheetTitle}>{sheetTitle}</AppText>
              {isTextSheet ? (
                <Pressable onPress={commitTextSheet} hitSlop={10}>
                  <AppText style={styles.doneLabel}>Save</AppText>
                </Pressable>
              ) : (
                <Pressable onPress={() => setSheet(null)} hitSlop={10}>
                  <AppText style={styles.sheetClose}>Close</AppText>
                </Pressable>
              )}
            </View>

          {isTextSheet ? (
            <TextInput
              value={draftText}
              onChangeText={setDraftText}
              placeholder={
                sheet === 'birthday'
                  ? 'YYYY-MM-DD'
                  : sheet === 'bio'
                    ? 'A little about you'
                    : sheetTitle
              }
              placeholderTextColor={colors.textSecondary}
              autoFocus
              multiline={sheet === 'bio'}
              maxLength={sheet === 'bio' ? 280 : sheet === 'name' ? 40 : 80}
              keyboardType={sheet === 'birthday' ? 'numbers-and-punctuation' : 'default'}
              autoCapitalize={sheet === 'birthday' ? 'none' : 'sentences'}
              style={[styles.sheetInput, sheet === 'bio' && styles.sheetInputBio]}
            />
          ) : null}

          {sheet === 'gender' ? (
            <View style={styles.chipWrap}>
              {GENDERS.map((g) => (
                <OptionChip
                  key={g.value}
                  label={g.label}
                  selected={gender === g.value}
                  onPress={() => {
                    setGender(g.value);
                    setSheet(null);
                  }}
                />
              ))}
            </View>
          ) : null}

          {sheet === 'pronouns' ? (
            <View style={styles.chipWrap}>
              {PRONOUNS.map((p) => (
                <OptionChip
                  key={p}
                  label={p}
                  selected={pronouns === p}
                  onPress={() => {
                    setPronouns(p);
                    setSheet(null);
                  }}
                />
              ))}
            </View>
          ) : null}

          {sheet === 'height' ? (
            <ScrollView style={styles.heightList} showsVerticalScrollIndicator={false}>
              {HEIGHT_OPTIONS.map((h) => {
                const selected = cmToHeightLabel(heightCm) === h;
                return (
                  <Pressable
                    key={h}
                    onPress={() => {
                      setHeightCm(heightLabelToCm(h));
                      setSheet(null);
                    }}
                    style={[styles.heightRow, selected && styles.heightRowOn]}
                  >
                    <AppText style={[styles.heightText, selected && styles.heightTextOn]}>{h}</AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {sheet === 'interests' ? (
            <View style={styles.chipWrap}>
              {INTEREST_CHIPS.map((item) => {
                const on = interests.includes(item);
                return (
                  <OptionChip
                    key={item}
                    label={item}
                    selected={on}
                    onPress={() =>
                      setInterests((curr) =>
                        on ? curr.filter((x) => x !== item) : curr.length >= 6 ? curr : [...curr, item],
                      )
                    }
                  />
                );
              })}
              <Pressable style={styles.sheetPrimary} onPress={() => setSheet(null)}>
                <AppText style={styles.sheetPrimaryLabel}>Done</AppText>
              </Pressable>
            </View>
          ) : null}

          {sheet === 'openTo' ? (
            <View style={styles.chipWrap}>
              {interestOptions.map((opt) => (
                <OptionChip
                  key={opt.value}
                  label={opt.label}
                  selected={interestedIn === opt.value}
                  onPress={() => {
                    setInterestedIn(opt.value);
                    setSheet(null);
                  }}
                />
              ))}
            </View>
          ) : null}

          {sheet === 'vibe' ? (
            <View style={styles.chipWrap}>
              {datingVibes.map((opt) => (
                <OptionChip
                  key={opt.value}
                  label={opt.label}
                  selected={vibe === opt.value}
                  onPress={() => {
                    setVibe(opt.value as DatingIntention);
                    setSheet(null);
                  }}
                />
              ))}
            </View>
          ) : null}

          {sheet === 'food' ? (
            <View style={styles.chipWrap}>
              {FOOD_CUISINES.map((c) => (
                <OptionChip
                  key={c.value}
                  label={c.label}
                  selected={foodPreference === c.value}
                  onPress={() => {
                    setFoodPreference(c.value);
                    setSheet(null);
                  }}
                />
              ))}
            </View>
          ) : null}

          {sheet === 'drinking' ? (
            <View style={styles.chipWrap}>
              {DRINKING.map((v) => (
                <OptionChip
                  key={v}
                  label={v}
                  selected={drinking === v}
                  onPress={() => {
                    setDrinking(v);
                    setSheet(null);
                  }}
                />
              ))}
            </View>
          ) : null}

          {sheet === 'smoking' ? (
            <View style={styles.chipWrap}>
              {SMOKING.map((v) => (
                <OptionChip
                  key={v}
                  label={v}
                  selected={smoking === v}
                  onPress={() => {
                    setSmoking(v);
                    setSheet(null);
                  }}
                />
              ))}
            </View>
          ) : null}
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topBtn: {
    minWidth: 56,
    height: 40,
    justifyContent: 'center',
  },
  topBtnRight: {
    alignItems: 'flex-end',
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  topTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  topSub: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  backGlyph: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '300',
  },
  doneLabel: {
    color: colors.brandBright,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  completion: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  preview: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoWrap: {
    width: 88,
    height: 112,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmptyLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  previewMeta: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  previewPlace: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  previewPlaceMuted: {
    color: colors.textSecondary,
    fontSize: 13,
    opacity: 0.8,
  },
  previewLink: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewLinkText: {
    color: colors.brandBright,
    fontSize: 14,
    fontWeight: '700',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    marginLeft: 4,
    color: colors.textSecondary,
  },
  sectionCard: {
    borderRadius: radii.card,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowPressed: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  rowMain: {
    flex: 1,
    gap: 4,
  },
  rowLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  rowValue: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  rowValueMulti: {
    lineHeight: 19,
  },
  rowPlaceholder: {
    color: colors.textSecondary,
    opacity: 0.65,
  },
  chevron: {
    color: colors.textSecondary,
    fontSize: 22,
    fontWeight: '300',
    marginTop: -2,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: '78%',
    backgroundColor: colors.elevated,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
    gap: spacing.md,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  sheetClose: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  sheetInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  sheetInputBio: {
    minHeight: 140,
    textAlignVertical: 'top',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: spacing.sm,
  },
  heightList: {
    maxHeight: 320,
  },
  heightRow: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  heightRowOn: {
    backgroundColor: 'rgba(168,85,247,0.12)',
  },
  heightText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  heightTextOn: {
    color: colors.brandBright,
  },
  sheetPrimary: {
    marginTop: spacing.sm,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.brand,
  },
  sheetPrimaryLabel: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
});
