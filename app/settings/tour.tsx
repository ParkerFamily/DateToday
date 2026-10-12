import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppTour, type TourStep } from '@/components/tour/AppTour';
import { colors } from '@/constants/theme';
import { markAppTourSeen } from '@/lib/appTour';

/** Settings → App tour (and Discover's help button): replays the walkthrough. */
export default function AppTourReplay() {
  const router = useRouter();
  const { step } = useLocalSearchParams<{ step?: TourStep }>();
  const done = () => {
    void markAppTourSeen();
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppTour visible startAt={step} onDone={done} />
    </View>
  );
}
