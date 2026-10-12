import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Text, View, type ColorValue } from 'react-native';
import { Tabs, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { AppTour } from '@/components/tour/AppTour';
import { colors } from '@/constants/theme';
import { useLiveActivitySync } from '@/features/live/liveActivity';
import { useLiveSessionResync } from '@/features/live/restoreLiveSession';
import { useNearbyPresence } from '@/features/live/nearbyPresence';
import { useTonightNudgeOptIn } from '@/features/notifications/nudgeOptIn';
import { usePendingInvite } from '@/features/referrals/usePendingInvite';
import { useMatchesSubscription, useUnreadMatchCount } from '@/store/matches';
import { useSessionStore } from '@/store/session';
import { isLiveSessionActive } from '@/utils/time';
import { ScaledSheet, rs } from '@/lib/scale';
import { markAppTourSeen, shouldShowAppTour } from '@/lib/appTour';

const LiveTabIcon = memo(function LiveTabIcon({
  color,
  size,
  focused,
}: {
  color: ColorValue;
  size: number;
  focused: boolean;
}) {
  const liveSession = useSessionStore((s) => s.liveSession);
  const live = useMemo(
    () => liveSession ? isLiveSessionActive(liveSession, new Date()) : false,
    [liveSession?.id, liveSession?.expiresAt]
  );
  const pulseRef = useRef(useSharedValue(1));
  const pulse = pulseRef.current;

  useEffect(() => {
    if (!live) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return;
    }
    
    if (AppState.currentState !== 'active') return;
    
    pulse.value = withRepeat(
      withTiming(1.18, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && live) {
        pulse.value = withRepeat(
          withTiming(1.18, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          -1,
          true,
        );
      } else {
        cancelAnimation(pulse);
        pulse.value = 1;
      }
    });
    
    return () => {
      cancelAnimation(pulse);
      sub.remove();
    };
  }, [live, pulse]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: live ? pulse.value : 1 }],
  }));

  return (
    <Animated.View style={anim}>
      <Ionicons
        name={live ? 'radio-button-on' : focused ? 'flash' : 'flash-outline'}
        size={rs(size)}
        color={live ? colors.live : color}
      />
    </Animated.View>
  );
});

const MatchesTabIcon = memo(function MatchesTabIcon({
  color,
  size,
  focused,
}: {
  color: ColorValue;
  size: number;
  focused: boolean;
}) {
  const unread = useUnreadMatchCount();

  return (
    <View>
      <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={rs(size)} color={color} />
      {unread > 0 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      ) : null}
    </View>
  );
});

const TAB_PATHS = new Set(['/', '/live', '/pings', '/dates', '/profile']);

/** Shows the app tour once, the first time someone lands on a tab. */
function useFirstRunTour() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void shouldShowAppTour().then((show) => {
        if (show && !cancelled) setOpen(true);
      });
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    void markAppTourSeen();
  }, []);
  return { visible: open && TAB_PATHS.has(pathname), close };
}

export default function TabsLayout() {
  // Re-enabled after fixing unbounded Firestore queries
  useMatchesSubscription();
  useLiveSessionResync();
  useLiveActivitySync();
  useTonightNudgeOptIn();
  usePendingInvite();
  useNearbyPresence();
  const tour = useFirstRunTour();
  const insets = useSafeAreaInsets();
  const liveSession = useSessionStore((s) => s.liveSession);
  // Memoize expensive computations - don't recalculate on every render
  const live = useMemo(
    () => liveSession ? isLiveSessionActive(liveSession, new Date()) : false,
    [liveSession?.id, liveSession?.expiresAt]
  );
  const tabPadBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 8);
  // Browsers lay out the label line taller, so web needs a little more room to avoid clipping it.
  const tabBarHeight = rs(52) + tabPadBottom + (Platform.OS === 'web' ? 10 : 0);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.elevated,
            borderTopColor: colors.border,
            height: tabBarHeight,
            paddingTop: rs(8),
            paddingBottom: tabPadBottom,
          },
          tabBarActiveTintColor: colors.brandBright,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarLabelPosition: 'below-icon',
          tabBarLabelStyle: {
            fontSize: rs(11),
            fontWeight: '600',
            letterSpacing: 0.3,
          },
        }}
      >
        <Tabs.Screen
          name="live/index"
          options={{
            title: live ? 'Pinging' : 'Live',
            tabBarActiveTintColor: live ? colors.live : colors.brandBright,
            tabBarIcon: (props) => <LiveTabIcon {...props} />,
            lazy: false,
          }}
        />
        <Tabs.Screen name="pings/index" options={{ href: null }} />
        <Tabs.Screen
          name="dates/index"
          options={{
            title: 'Matches',
            tabBarIcon: (props) => <MatchesTabIcon {...props} />,
            lazy: false,
          }}
        />
        <Tabs.Screen
          name="profile/index"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={rs(size)} color={color} />
            ),
            lazy: false,
          }}
        />
        <Tabs.Screen name="index" options={{ href: null }} />
      </Tabs>
      <AppTour visible={tour.visible} onDone={tour.close} />
    </>
  );
}

const styles = ScaledSheet.create({
  countBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandBright,
  },
  countText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    includeFontPadding: false,
  },
});
