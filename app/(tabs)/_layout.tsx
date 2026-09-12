import React, { useEffect } from 'react';
import { Platform, StyleSheet, View, type ColorValue } from 'react-native';
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
import { useSessionStore } from '@/store/session';
import { isLiveSessionActive } from '@/utils/time';

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
        size={size}
        color={live ? colors.live : color}
      />
    </Animated.View>
  );
}

function DiscoverTabIcon({
  color,
  size,
  focused,
}: {
  color: ColorValue;
  size: number;
  focused: boolean;
}) {
  const attention = useSessionStore((s) => s.discoverAttention);

  return (
    <View>
      <Ionicons name={focused ? 'heart' : 'heart-outline'} size={size} color={color} />
      {attention ? <View style={styles.badge} /> : null}
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const liveSession = useSessionStore((s) => s.liveSession);
  const live = liveSession ? isLiveSessionActive(liveSession, new Date()) : false;
  const tabPadBottom = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 8);
  const tabBarHeight = 52 + tabPadBottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.elevated,
          borderTopColor: colors.border,
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: tabPadBottom,
        },
        tabBarActiveTintColor: colors.brandBright,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
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
      <Tabs.Screen
        name="pings/index"
        options={{
          title: 'Ping',
          tabBarIcon: (props) => <DiscoverTabIcon {...props} />,
        }}
      />
      <Tabs.Screen
        name="dates/index"
        options={{
          title: 'Dates',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile/index"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -1,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brandBright,
  },
});
