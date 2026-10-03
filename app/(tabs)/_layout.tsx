import React, { useEffect } from 'react';
import { Platform, Text, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
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
import { colors } from '@/constants/theme';
import { useLiveActivitySync } from '@/features/live/liveActivity';
import { useLiveSessionResync } from '@/features/live/restoreLiveSession';
import { useNearbyPresence } from '@/features/live/nearbyPresence';
import { useTonightNudgeOptIn } from '@/features/notifications/nudgeOptIn';
import { useMatchesSubscription, useUnreadMatchCount } from '@/store/matches';
import { useSessionStore } from '@/store/session';
import { isLiveSessionActive } from '@/utils/time';
import { ScaledSheet, rs } from '@/lib/scale';

function LiveTabIcon({
  color,
  size,
  focused,
}: {
  color: ColorValue;
  size: number;
  focused: boolean;
}) {
  const liveSession = useSessionStore((s) => s.liveSession);
  const live = liveSession ? isLiveSessionActive(liveSession, new Date()) : false;
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!live) {
      cancelAnimation(pulse);
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1.18, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(pulse);
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
}

function MatchesTabIcon({
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
}

export default function TabsLayout() {
  useMatchesSubscription();
  useLiveSessionResync();
  useLiveActivitySync();
  useTonightNudgeOptIn();
  useNearbyPresence();
  const insets = useSafeAreaInsets();
  const liveSession = useSessionStore((s) => s.liveSession);
  const live = liveSession ? isLiveSessionActive(liveSession, new Date()) : false;
  const tabPadBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 8);
  const tabBarHeight = rs(52) + tabPadBottom;

  return (
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
        }}
      />
      <Tabs.Screen name="pings/index" options={{ href: null }} />
      <Tabs.Screen
        name="dates/index"
        options={{
          title: 'Matches',
          tabBarIcon: (props) => <MatchesTabIcon {...props} />,
        }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={rs(size)} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
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
  },
});
