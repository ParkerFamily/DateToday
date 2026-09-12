import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { colors } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { useSessionStore } from '@/store/session';
import type { RadiusMiles } from '@/types';

const PRESETS: RadiusMiles[] = [5, 10, 15, 25, 50];

export default function DistanceScreen() {
  const router = useRouter();
  const radiusMiles = useOnboardingDraft((s) => s.radiusMiles);
  const setRadiusMiles = useOnboardingDraft((s) => s.setRadiusMiles);
  const setLocationEnabled = useOnboardingDraft((s) => s.setLocationEnabled);
  const setLocationGranted = useSessionStore((s) => s.setLocationGranted);
  const [loading, setLoading] = useState(false);

  const next = async () => {
    try {
      setLoading(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';
      setLocationEnabled(granted);
      setLocationGranted(granted);
      if (!granted) {
        Alert.alert(
          'Find people near you',
          'DateToday needs your location while you’re using the app to find nearby people.',
        );
      }
      router.push('/(onboarding)/photo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS.distance}
      title="How far tonight?"
      subtitle="Close enough to actually meet."
      footer={
        <PrimaryCta
          label="Use My Location"
          showArrow={false}
          loading={loading}
          onPress={next}
        />
      }
    >
      <View style={styles.presets}>
        {PRESETS.map((miles) => {
          const on = radiusMiles === miles;
          return (
            <Pressable
              key={miles}
              onPress={() => {
                void Haptics.selectionAsync();
                setRadiusMiles(miles);
              }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <AppText style={[styles.chipText, on && styles.chipTextOn]}>{miles} mi</AppText>
            </Pressable>
          );
        })}
      </View>
      <AppText style={styles.big}>{radiusMiles}</AppText>
      <AppText style={styles.mi}>MI</AppText>
    </OnboardingChrome>
  );
}

const styles = StyleSheet.create({
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brandBright,
  },
  chipText: { color: colors.textSecondary, fontWeight: '700' },
  chipTextOn: { color: colors.text },
  big: {
    marginTop: 28,
    textAlign: 'center',
    color: colors.text,
    fontSize: 64,
    fontWeight: '800',
    letterSpacing: -2,
  },
  mi: {
    textAlign: 'center',
    color: colors.brandBright,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
