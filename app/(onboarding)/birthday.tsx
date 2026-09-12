import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { colors } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import { calculateAge, isAtLeast18 } from '@/utils/time';
import { syncOnboardingFromFirebaseAuth } from '@/features/auth/social';
import { persistAgeConfirmation } from '@/features/profile/persistAge';
import { hasEnteredApp } from '@/utils/accountEntry';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const ITEM_H = 44;
const YEARS = Array.from({ length: 60 }, (_, i) => new Date().getFullYear() - 18 - i);
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function Wheel({
  data,
  value,
  onChange,
  format,
}: {
  data: (string | number)[];
  value: string | number;
  onChange: (v: string | number) => void;
  format?: (v: string | number) => string;
}) {
  const ref = useRef<ScrollView>(null);
  const index = Math.max(0, data.findIndex((d) => d === value));
  const onMomentum = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    onChange(data[Math.min(Math.max(i, 0), data.length - 1)]);
  };
  return (
    <View style={styles.wheel}>
      <View style={styles.highlight} pointerEvents="none" />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: ITEM_H * 2 }}
        onLayout={() => ref.current?.scrollTo({ y: index * ITEM_H, animated: false })}
        onMomentumScrollEnd={onMomentum}
      >
        {data.map((item) => (
          <View key={String(item)} style={styles.item}>
            <AppText style={[styles.itemText, item === value && styles.itemOn]}>
              {format ? format(item) : String(item)}
            </AppText>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default function BirthdayScreen() {
  const router = useRouter();
  const dob = useOnboardingDraft((s) => s.dateOfBirth);
  const setDateOfBirth = useOnboardingDraft((s) => s.setDateOfBirth);
  const profile = useSessionStore((s) => s.profile);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    syncOnboardingFromFirebaseAuth();
    const draft = useOnboardingDraft.getState();
    const savedDob = useSessionStore.getState().profile?.dateOfBirth;
    if (!draft.dateOfBirth && savedDob) {
      draft.setDateOfBirth(savedDob);
    }
  }, []);

  const parsed = useMemo(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      const [y, m, d] = dob.split('-').map(Number);
      return { year: y, month: m, day: d };
    }
    return { year: 2005, month: 7, day: 3 };
  }, [dob]);

  const commit = (year: number, month: number, day: number) => {
    setDateOfBirth(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  };

  const iso = `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
  let age = 0;
  try {
    age = calculateAge(iso);
  } catch {
    age = 0;
  }
  const ok = isAtLeast18(iso);
  const editingFromApp = hasEnteredApp(profile);

  const onContinue = async () => {
    if (!ok || saving) return;
    setDateOfBirth(iso);
    try {
      setSaving(true);
      // Write 18+ to account immediately so "Confirm 18+" clears on profile.
      await persistAgeConfirmation(iso);
      if (editingFromApp) {
        router.replace('/(tabs)/profile');
        return;
      }
      router.push('/(onboarding)/agreements');
    } catch (error) {
      Alert.alert('Could not save age', error instanceof Error ? error.message : 'Try again');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS.birthday}
      title="How old are you?"
      subtitle="DateToday is 18+."
      onBack={editingFromApp ? undefined : 'landing'}
      showSkipSetup={!editingFromApp}
      footer={
        <PrimaryCta
          label="Continue"
          showArrow={false}
          disabled={!ok}
          loading={saving}
          onPress={() => {
            void onContinue();
          }}
        />
      }
    >
      <View style={styles.wheels}>
        <Wheel
          data={MONTHS}
          value={MONTHS[parsed.month - 1]}
          onChange={(m) => commit(parsed.year, MONTHS.indexOf(String(m)) + 1, parsed.day)}
        />
        <Wheel
          data={DAYS}
          value={parsed.day}
          format={(d) => String(d).padStart(2, '0')}
          onChange={(d) => commit(parsed.year, parsed.month, Number(d))}
        />
        <Wheel
          data={YEARS}
          value={parsed.year}
          onChange={(y) => commit(Number(y), parsed.month, parsed.day)}
        />
      </View>
      <AppText style={[styles.age, !ok && styles.bad]}>{age}{ok ? ' ✓' : ''}</AppText>
    </OnboardingChrome>
  );
}

const styles = StyleSheet.create({
  wheels: { flexDirection: 'row', gap: 8, height: ITEM_H * 5 },
  wheel: { flex: 1, overflow: 'hidden' },
  highlight: {
    position: 'absolute',
    top: ITEM_H * 2,
    left: 0,
    right: 0,
    height: ITEM_H,
    borderRadius: 12,
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.35)',
    zIndex: 1,
  },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { color: colors.textSecondary, fontSize: 18, fontWeight: '700' },
  itemOn: { color: colors.text, fontSize: 20 },
  age: {
    marginTop: 16,
    textAlign: 'center',
    color: colors.live,
    fontSize: 36,
    fontWeight: '800',
  },
  bad: { color: colors.danger },
});
