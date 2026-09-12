import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { CloseButton, dismissToLive } from '@/components/ui/CloseButton';
import { spotsForCuisine } from '@/constants/dateSpots';
import { foodLabel, type FoodCuisine } from '@/constants/tonightVibe';
import { colors, radii, spacing } from '@/constants/theme';

const VIBES = [
  { value: 'drinks', label: '🍸 Drinks' },
  { value: 'dinner', label: '🍽 Dinner' },
  { value: 'coffee', label: '☕ Coffee' },
  { value: 'activity', label: '🎳 Activity' },
] as const;

const TIMES = ['7:30', '8:00', '8:30', '9:00', '9:30', '10:00'] as const;

export default function PlanDateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    name?: string;
    photo?: string;
    food?: string;
    mode?: string;
    conversationId?: string;
  }>();
  const name = params.name ?? 'them';
  const conversationId = params.conversationId ?? 'new';
  const sharedFood =
    typeof params.food === 'string' && params.food.length
      ? (params.food as FoodCuisine)
      : null;
  const spotMode = params.mode === 'spot' || Boolean(sharedFood);

  const spots = useMemo(() => spotsForCuisine(sharedFood), [sharedFood]);

  const [activity, setActivity] = useState<string>(sharedFood ? 'dinner' : 'drinks');
  const [time, setTime] = useState('8:30');
  const [venue, setVenue] = useState(spots[0]?.name ?? 'Barcelona Wine Bar');
  const [selectedSpotId, setSelectedSpotId] = useState(spots[0]?.id ?? '');
  const [loading, setLoading] = useState(false);

  const activityLabel = useMemo(
    () => VIBES.find((v) => v.value === activity)?.label ?? activity,
    [activity],
  );

  const submit = () => {
    if (!venue.trim()) {
      Alert.alert('Where?', 'Add a meeting spot.');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      // Send proposal into chat — they ACCEPT / CHANGE / DECLINE there
      router.replace({
        pathname: '/chat/[conversationId]',
        params: {
          conversationId,
          name,
          photo: params.photo ?? '',
          food: sharedFood ?? '',
          proposalVenue: venue.trim(),
          proposalTime: time,
          proposalActivity: activityLabel,
        },
      });
    }, 350);
  };

  return (
    <Screen padded={false} edges={['left', 'right']}>
      <View style={styles.root}>
        <Pressable style={styles.dim} onPress={() => dismissToLive(router)} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetAnchor}
        >
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />
            <View style={styles.sheetTop}>
              <View>
                <AppText style={styles.sheetTitle}>
                  {spotMode ? 'Find a spot' : 'Make a plan'}
                </AppText>
                <AppText style={styles.with}>with {name}</AppText>
              </View>
              <CloseButton onPress={() => dismissToLive(router)} />
            </View>

            {sharedFood ? (
              <View style={styles.sharedBanner}>
                <AppText style={styles.sharedText}>
                  You both said {foodLabel(sharedFood)}
                </AppText>
              </View>
            ) : null}

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!spotMode ? (
                <>
                  <AppText style={styles.label}>What?</AppText>
                  <View style={styles.chipRow}>
                    {VIBES.map((v) => {
                      const on = activity === v.value;
                      return (
                        <Pressable
                          key={v.value}
                          onPress={() => setActivity(v.value)}
                          style={[styles.chip, on && styles.chipOn]}
                        >
                          <AppText style={[styles.chipText, on && styles.chipTextOn]}>
                            {v.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {spotMode ? (
                <>
                  <AppText style={styles.label}>Nearby public spots</AppText>
                  {spots.map((spot) => {
                    const on = selectedSpotId === spot.id;
                    return (
                      <Pressable
                        key={spot.id}
                        onPress={() => {
                          setSelectedSpotId(spot.id);
                          setVenue(spot.name);
                          setActivity('dinner');
                        }}
                        style={[styles.spotCard, on && styles.spotCardOn]}
                      >
                        <AppText style={styles.spotName}>{spot.name}</AppText>
                        <AppText style={styles.spotMeta}>
                          {spot.milesFromYou} mi from you · {spot.milesFromThem} mi from{' '}
                          {name}
                        </AppText>
                        <AppText style={styles.spotHood}>{spot.neighborhood}</AppText>
                      </Pressable>
                    );
                  })}
                  <AppText style={styles.hint}>
                    Partnerships & live maps later — pick a public spot for now.
                  </AppText>
                </>
              ) : (
                <>
                  <AppText style={styles.label}>Where?</AppText>
                  <TextInput
                    value={venue}
                    onChangeText={setVenue}
                    placeholder="Venue name"
                    placeholderTextColor={colors.textSecondary}
                    style={styles.input}
                  />
                </>
              )}

              <AppText style={styles.label}>When?</AppText>
              <View style={styles.chipRow}>
                {TIMES.map((t) => {
                  const on = time === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => setTime(t)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <AppText style={[styles.chipText, on && styles.chipTextOn]}>{t}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <Button
              label={spotMode ? 'PROPOSE DATE' : 'SEND PLAN ⚡'}
              loading={loading}
              onPress={submit}
              style={styles.send}
            />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(5,5,6,0.72)',
  },
  dim: {
    ...StyleSheet.absoluteFill,
  },
  sheetAnchor: {
    width: '100%',
    maxHeight: '88%',
  },
  sheet: {
    backgroundColor: colors.elevated,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    gap: 10,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 4,
  },
  sheetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  with: {
    color: colors.textSecondary,
    marginTop: 2,
    fontSize: 15,
  },
  sharedBanner: {
    backgroundColor: 'rgba(34,229,139,0.12)',
    borderRadius: radii.card,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,229,139,0.3)',
  },
  sharedText: {
    color: colors.live,
    fontWeight: '700',
    textAlign: 'center',
  },
  scroll: {
    maxHeight: 360,
  },
  scrollContent: {
    gap: 10,
    paddingBottom: 8,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {
    backgroundColor: 'rgba(124,58,237,0.28)',
    borderColor: colors.brandBright,
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextOn: {
    color: colors.text,
  },
  spotCard: {
    padding: 14,
    borderRadius: radii.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  spotCardOn: {
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(124,58,237,0.18)',
  },
  spotName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  spotMeta: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  spotHood: {
    color: colors.brandBright,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text,
    fontSize: 16,
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  send: {
    marginTop: 4,
  },
});
