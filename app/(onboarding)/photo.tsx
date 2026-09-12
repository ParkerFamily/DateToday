import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { OnboardingChrome, ONBOARD_PROGRESS } from '@/components/onboarding/OnboardingChrome';
import { SkipVideosButton } from '@/components/onboarding/SkipVideosButton';
import { colors, radii } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';

export default function PhotoScreen() {
  const router = useRouter();
  const mainPhotoUri = useOnboardingDraft((s) => s.mainPhotoUri);
  const setMainPhotoUri = useOnboardingDraft((s) => s.setMainPhotoUri);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    try {
      setBusy(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [3, 4],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setMainPhotoUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Could not open photos');
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingChrome
      progress={ONBOARD_PROGRESS.photo}
      title="Add your photo"
      subtitle="Photos upload fine. Video prompts are recorded live."
      footer={
        <>
          <PrimaryCta
            label="Continue"
            showArrow={false}
            loading={busy}
            disabled={!mainPhotoUri}
            onPress={() => router.push('/(onboarding)/video-pick')}
          />
          <SkipVideosButton />
        </>
      }
    >
      <Pressable style={styles.frame} onPress={pick}>
        {mainPhotoUri ? (
          <Image source={{ uri: mainPhotoUri }} style={styles.image} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="image-outline" size={32} color={colors.brandBright} />
            <AppText style={styles.emptyLabel}>Choose your best one</AppText>
          </View>
        )}
      </Pressable>
    </OnboardingChrome>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    borderRadius: radii.surface,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    minHeight: 280,
  },
  image: { width: '100%', height: '100%' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyLabel: { color: colors.text, fontWeight: '700' },
});
