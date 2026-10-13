import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/theme';
import { switchLiveMode } from '@/features/friendDate/liveMode';
import { errorCode } from '@/features/matches/api';
import { openUpgrade } from '@/lib/commerce/upgradePrompt';
import { friendlyError } from '@/lib/errors';
import { rs, ScaledSheet } from '@/lib/scale';
import { useFeedMode, useFriendDateMode } from '@/store/friendDate';
import { useSessionStore } from '@/store/session';
import type { LiveMode } from '@/types';
import { isLiveSessionActive } from '@/utils/time';

const OPTIONS: { value: LiveMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'dating', label: 'Dating', icon: 'heart' },
  { value: 'friend', label: 'Friend Date', icon: 'people' },
];

/**
 * Dating | Friend Date. Not Live: picks which stack to browse and how the next Live starts.
 * Live: switches the session itself, after a confirm (Friend Date may use a free weekly session).
 */
export function LiveModeSwitch({ style, compact = false }: { style?: StyleProp<ViewStyle>; compact?: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const mode = useFeedMode();
  const uid = useSessionStore((s) => s.userId);
  const live = useSessionStore((s) => Boolean(s.liveSession && isLiveSessionActive(s.liveSession, new Date())));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void useFriendDateMode.getState().hydrate(uid);
  }, [uid]);

  const apply = async (next: LiveMode) => {
    setBusy(true);
    try {
      await switchLiveMode(next);
      void queryClient.invalidateQueries({ queryKey: ['discovery-feed'] });
      void queryClient.invalidateQueries({ queryKey: ['friend-date-summary'] });
    } catch (error) {
      if (errorCode(error) === 'friend_date_limit') {
        openUpgrade(router, 'friend_date');
        return;
      }
      Alert.alert('Couldn’t switch', friendlyError(error, 'Try again in a moment.'));
    } finally {
      setBusy(false);
    }
  };

  const pick = (next: LiveMode) => {
    if (next === mode || busy) return;
    void Haptics.selectionAsync();
    if (!live) {
      useFriendDateMode.getState().setMode(next);
      return;
    }
    Alert.alert(
      next === 'friend' ? 'Switch to Friend Date?' : 'Switch back to Dating?',
      next === 'friend'
        ? 'Platonic plans only. You’ll see and be seen by people up for a Friend Date, and Dating won’t see you until you switch back.'
        : 'You’ll leave Friend Date and show up in Dating again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', onPress: () => void apply(next) },
      ],
    );
  };

  return (
    <View style={[styles.track, compact && styles.trackCompact, style]} accessibilityRole="tablist">
      {OPTIONS.map((o) => {
        const on = o.value === mode;
        const tint = on ? (o.value === 'friend' ? colors.friend : colors.white) : colors.textSecondary;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, busy }}
            accessibilityLabel={o.value === 'friend' ? 'Friend Date, platonic plans' : 'Dating'}
            onPress={() => pick(o.value)}
            style={[
              styles.option,
              compact ? styles.optionCompact : styles.optionFill,
              on && (o.value === 'friend' ? styles.friendOn : styles.datingOn),
            ]}
          >
            <Ionicons name={o.icon} size={rs(compact ? 13 : 15)} color={tint} />
            <AppText style={[styles.label, compact && styles.labelCompact, { color: tint }]} numberOfLines={1}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = ScaledSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    padding: 4,
    gap: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  trackCompact: {
    alignSelf: 'auto',
    padding: 3,
    gap: 2,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  optionFill: {
    flex: 1,
  },
  optionCompact: {
    flexShrink: 0,
    minHeight: 30,
    paddingHorizontal: 10,
    gap: 5,
  },
  datingOn: {
    backgroundColor: 'rgba(124,58,237,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.6)',
  },
  friendOn: {
    backgroundColor: 'rgba(20,184,166,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.5)',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  labelCompact: {
    fontSize: 12.5,
  },
});
