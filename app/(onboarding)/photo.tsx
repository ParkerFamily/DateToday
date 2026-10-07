import { ONBOARD_PROGRESS, OnboardingChrome } from '@/components/onboarding/OnboardingChrome';
import { PrimaryCta } from '@/components/onboarding/OnboardingUI';
import { SkipVideosButton } from '@/components/onboarding/SkipVideosButton';
import { AppText } from '@/components/ui/AppText';
import { colors, radii } from '@/constants/theme';
import { useOnboardingDraft } from '@/store/onboardingDraft';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { ScaledSheet, rs } from '@/lib/scale';

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
        quality: 0.75,
        // iCloud "Optimize Storage" photos aren't on-device; without this iOS returns no usable file.
        shouldDownloadFromNetwork: true,
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
          <Image 
            source={{ uri: mainPhotoUri }} 
            style={styles.image}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="image-outline" size={rs(32)} color={colors.brandBright} />
            <AppText style={styles.emptyLabel}>Choose your best one</AppText>
          </View>
        )}
      </Pressable>
    </OnboardingChrome>
  );
}

const styles = ScaledSheet.create({
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
