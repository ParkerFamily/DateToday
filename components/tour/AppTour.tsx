import React, { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Image, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { PRIORITY, PRIORITY_TEXT } from '@/components/likes/PriorityLikeSheet';
import { colors, gradients, spacing } from '@/constants/theme';
import { ScaledSheet, rs } from '@/lib/scale';

export type TourStep = 'welcome' | 'live' | 'friend' | 'swipe' | 'buttons' | 'matches' | 'plan' | 'profile' | 'invite';

const STEPS: { key: TourStep; title: string; body: string }[] = [
  {
    key: 'welcome',
    title: 'Welcome to DateToday',
    body: 'A quick tour of the main buttons, so you know where everything is.',
  },
  {
    key: 'live',
    title: 'Go live when you're free',
    body: 'On the Live tab, pick what you're in the mood for, then hold the button to go live. People nearby see you're free tonight.',
  },
  {
    key: 'friend',
    title: 'Friend Date for platonic plans',
    body: 'Switch to Friend Date mode to find people for strictly platonic hangouts. Perfect for making new friends or finding activity buddies.',
  },
  {
    key: 'swipe',
    title: 'Swipe through people',
    body: 'Swipe right to like, left to pass. Scroll down on a card to see more about them.',
  },
  {
    key: 'buttons',
    title: 'Buttons under each card',
    body: 'Undo brings back someone you passed. ✕ passes, ♥ likes, and ⚡ sends a Priority Like with a note.',
  },
  {
    key: 'matches',
    title: 'Matches and chats',
    body: 'When you both like each other, they show up in Matches. "Likes you" at the top shows who's into you.',
  },
  {
    key: 'plan',
    title: 'Plan a date',
    body: 'In a chat, tap Plan ⚡ to suggest a place and time. Once they accept it's a date. You can still request an edit or cancel.',
  },
  {
    key: 'profile',
    title: 'Your profile',
    body: 'Edit photos and your bio, get verified, and open Settings from the Profile tab.',
  },
  {
    key: 'invite',
    title: 'Invite friends, earn Likes',
    body: 'Settings → Invite Friends gives you a code. Friends get bonus Likes and you unlock free Likes and Like Reveals.',
  },
];

const CANVAS = 300;
const NEON_ICON = require('../../assets/images/dt-neon-transparent.png');

/** Full-screen walkthrough of the main tabs and buttons. Starts at `startAt` (default: the beginning). */
export function AppTour({
  visible,
  onDone,
  startAt = 'welcome',
}: {
  visible: boolean;
  onDone: () => void;
  startAt?: TourStep;
}) {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const pulse = useSharedValue(0);
  const swipeX = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    setIndex(Math.max(0, STEPS.findIndex((s) => s.key === startAt)));
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => setReduceMotion(Boolean(on)));
  }, [visible, startAt]);

  const step = STEPS[index] ?? STEPS[0];

  useEffect(() => {
    cancelAnimation(pulse);
    cancelAnimation(swipeX);
    pulse.value = 0;
    swipeX.value = 0;
    if (!visible) return;
    if (reduceMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.25, { duration: 700 })), -1);
    if (step.key === 'swipe') {
      swipeX.value = withRepeat(
        withSequence(
          withTiming(70, { duration: 700, easing: Easing.out(Easing.cubic) }),
          withDelay(350, withTiming(0, { duration: 350 })),
          withTiming(-70, { duration: 700, easing: Easing.out(Easing.cubic) }),
          withDelay(350, withTiming(0, { duration: 350 })),
        ),
        -1,
      );
    }
  }, [visible, step.key, reduceMotion, pulse, swipeX]);

  if (!visible) return null;

  // The mockup gets what's left after the text and buttons, so it fits an SE and an iPad alike.
  const stageH = Math.max(140, Math.min(height - insets.top - insets.bottom - rs(370), rs(360)));
  const stageW = Math.min(width - spacing.lg * 2, 420);
  const scale = Math.min(stageH, stageW) / CANVAS;
  const last = index === STEPS.length - 1;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onDone}>
      <View style={[styles.backdrop, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.main}>
          <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <View key={s.key} style={[styles.dot, i === index && styles.dotOn]} />
            ))}
          </View>

          <View style={{ width: stageW, height: stageH }} importantForAccessibility="no-hide-descendants">
            <View
              style={[
                styles.canvas,
                {
                  left: (stageW - CANVAS) / 2,
                  top: (stageH - CANVAS) / 2,
                  transform: [{ scale }],
                },
              ]}
            >
              <Mockup step={step.key} pulse={pulse} swipeX={swipeX} />
            </View>
          </View>

          <View style={styles.text}>
            <AppText style={styles.title}>{step.title}</AppText>
            <AppText style={styles.body}>{step.body}</AppText>
          </View>
        </View>

        <View style={styles.buttons}>
          <View style={styles.flex}>
            {index > 0 ? (
              <Button label="Back" variant="ghost" onPress={() => setIndex((i) => Math.max(0, i - 1))} />
            ) : (
              <Button label="Skip" variant="ghost" onPress={onDone} />
            )}
          </View>
          <View style={styles.flex}>
            <Button
              label={last ? 'Got it' : 'Next'}
              onPress={() => (last ? onDone() : setIndex((i) => i + 1))}
            />
          </View>
        </View>
        {index > 0 && !last ? (
          <Pressable onPress={onDone} hitSlop={10} accessibilityRole="button">
            <AppText style={styles.skip}>Skip tour</AppText>
          </Pressable>
        ) : (
          <View style={styles.skipSpacer} />
        )}
      </View>
    </Modal>
  );
}

function Mockup({ step, pulse, swipeX }: { step: TourStep; pulse: SharedValue<number>; swipeX: SharedValue<number> }) {
  const card = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }, { rotate: `${swipeX.value / 8}deg` }],
  }));
  const likeStamp = useAnimatedStyle(() => ({ opacity: Math.max(0, swipeX.value / 70) }));
  const passStamp = useAnimatedStyle(() => ({ opacity: Math.max(0, -swipeX.value / 70) }));

  switch (step) {
    case 'welcome':
      return (
        <View style={m.center}>
          <Image source={NEON_ICON} style={m.logo} resizeMode="contain" />
          <AppText style={m.logoText}>DateToday</AppText>
          <AppText style={m.logoSub}>Dating for right now</AppText>
        </View>
      );
    case 'live':
      return (
        <View style={m.screen}>
          <AppText style={m.screenTitle}>Who’s out tonight?</AppText>
          <View style={m.chips}>
            {['🍸 Drinks', '🍽 Dinner', '☕ Coffee'].map((c, i) => (
              <View key={c} style={[m.chip, i === 0 && m.chipOn]}>
                <AppText style={m.chipText}>{c}</AppText>
              </View>
            ))}
          </View>
          <View style={m.grow} />
          <Glow pulse={pulse} radius={28}>
            <LinearGradient colors={[...gradients.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={m.goLive}>
              <AppText style={m.goLiveText}>HOLD TO GO LIVE ⚡</AppText>
            </LinearGradient>
          </Glow>
          <TabBar active="live" pulse={pulse} />
        </View>
      );
    case 'friend':
      return (
        <View style={m.screen}>
          <AppText style={m.screenTitle}>Who's out tonight?</AppText>
          <Glow pulse={pulse} radius={16}>
            <View style={m.modeSwitch}>
              <View style={m.modeTab}>
                <AppText style={m.modeText}>Dating</AppText>
              </View>
              <View style={[m.modeTab, m.modeTabOn]}>
                <Ionicons name="people" size={14} color={colors.friend} />
                <AppText style={[m.modeText, m.modeTextOn]}>Friend Date</AppText>
              </View>
            </View>
          </Glow>
          <View style={m.friendTag}>
            <Ionicons name="people" size={12} color={colors.friend} />
            <AppText style={m.friendTagText}>FRIEND DATE · PLATONIC</AppText>
          </View>
          <View style={m.friendNote}>
            <AppText style={m.friendNoteText}>For platonic plans only</AppText>
            <AppText style={m.friendNoteText}>You'll only see people also in Friend Date mode</AppText>
          </View>
          <View style={m.grow} />
          <TabBar active="live" pulse={pulse} />
        </View>
      );
    case 'swipe':
      return (
        <View style={m.center}>
          <Animated.View style={[m.card, card]}>
            <Ionicons name="person" size={64} color={colors.textSecondary} />
            <View style={m.lines}>
              <View style={[m.line, { width: '60%' }]} />
              <View style={[m.line, { width: '40%' }]} />
            </View>
            <Animated.View style={[m.stamp, m.stampLike, likeStamp]}>
              <Ionicons name="heart" size={24} color={colors.brandBright} />
            </Animated.View>
            <Animated.View style={[m.stamp, m.stampPass, passStamp]}>
              <Ionicons name="close" size={24} color={colors.danger} />
            </Animated.View>
          </Animated.View>
        </View>
      );
    case 'buttons':
      return (
        <View style={m.center}>
          <View style={m.actionRow}>
            <ActionButton label="Undo" style={m.rewind} icon="arrow-undo" color={colors.warning} size={48} />
            <ActionButton label="Pass" style={m.pass} icon="close" color={colors.text} size={56} />
            <ActionButton label="Like" style={m.like} icon="heart" color={colors.white} size={66} pulse={pulse} />
            <ActionButton label="Priority" style={m.priority} icon="flash" color={PRIORITY_TEXT} size={48} />
          </View>
        </View>
      );
    case 'matches':
      return (
        <View style={m.screen}>
          <AppText style={m.screenTitle}>Matches</AppText>
          <Glow pulse={pulse} radius={16}>
            <View style={m.likesStrip}>
              <AppText style={m.likesTitle}>LIKES YOU</AppText>
              <View style={m.likesRow}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={m.likeAvatar}>
                    <Ionicons name="heart" size={16} color={colors.brandBright} />
                  </View>
                ))}
              </View>
            </View>
          </Glow>
          {[0].map((i) => (
            <View key={i} style={m.chatRow}>
              <View style={m.avatar} />
              <View style={m.chatLines}>
                <View style={[m.line, { width: '50%' }]} />
                <View style={[m.line, { width: '80%', opacity: 0.6 }]} />
              </View>
              {i === 0 ? (
                <View style={m.turn}>
                  <AppText style={m.turnText}>Your turn</AppText>
                </View>
              ) : null}
            </View>
          ))}
          <View style={m.grow} />
          <TabBar active="matches" pulse={pulse} />
        </View>
      );
    case 'plan':
      return (
        <View style={m.screen}>
          <View style={m.chatHeader}>
            <View style={m.avatarSm} />
            <View style={m.grow} />
            <Glow pulse={pulse} radius={16}>
              <View style={m.planPill}>
                <AppText style={m.planText}>Plan ⚡</AppText>
              </View>
            </Glow>
          </View>
          <View style={m.proposal}>
            <AppText style={m.proposalEyebrow}>IT’S A DATE ⚡</AppText>
            <AppText style={m.proposalVenue}>Your spot</AppText>
            <AppText style={m.proposalMeta}>🍸 Drinks · Tonight 8pm</AppText>
            <View style={m.proposalLinks}>
              <AppText style={m.proposalEdit}>Request edit</AppText>
              <AppText style={m.proposalCancel}>Cancel date</AppText>
            </View>
          </View>
        </View>
      );
    case 'profile':
      return (
        <View style={m.screen}>
          <View style={m.profileTop}>
            <View style={m.profilePhoto}>
              <Ionicons name="person" size={40} color={colors.textSecondary} />
              <View style={m.cameraBadge}>
                <Ionicons name="camera" size={12} color={colors.white} />
              </View>
            </View>
            <View style={m.strength}>
              <AppText style={m.strengthText}>Profile strength</AppText>
              <View style={m.bar}>
                <View style={m.barFill} />
              </View>
            </View>
          </View>
          {['Edit profile', 'Get verified', 'Settings'].map((r) => (
            <View key={r} style={m.row}>
              <AppText style={m.rowText}>{r}</AppText>
              <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
            </View>
          ))}
          <View style={m.grow} />
          <TabBar active="profile" pulse={pulse} />
        </View>
      );
    case 'invite':
      return (
        <View style={m.center}>
          <LinearGradient colors={['#2A1550', '#16101F']} style={m.inviteCard}>
            <Ionicons name="gift" size={34} color={colors.brandBright} />
            <AppText style={m.inviteLabel}>YOUR INVITE CODE</AppText>
            <AppText style={m.inviteCode}>FRIEND26</AppText>
            <Glow pulse={pulse} radius={20}>
              <LinearGradient colors={[...gradients.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={m.sharePill}>
                <AppText style={m.shareText}>Share invite</AppText>
              </LinearGradient>
            </Glow>
          </LinearGradient>
        </View>
      );
  }
}

function Glow({ children, pulse, radius = 999 }: { children: ReactNode; pulse: SharedValue<number>; radius?: number }) {
  const ring = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <View>
      <Animated.View pointerEvents="none" style={[m.glow, { borderRadius: radius }, ring]} />
      {children}
    </View>
  );
}

function ActionButton({
  label,
  style,
  icon,
  color,
  size,
  pulse,
}: {
  label: string;
  style: object;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  size: number;
  pulse?: SharedValue<number>;
}) {
  const circle = (
    <View style={[m.actionBtn, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <Ionicons name={icon} size={size * 0.45} color={color} />
    </View>
  );
  return (
    <View style={m.action}>
      <View style={m.actionSlot}>{pulse ? <Glow pulse={pulse}>{circle}</Glow> : circle}</View>
      <AppText style={m.actionLabel}>{label}</AppText>
    </View>
  );
}

const TABS = [
  { key: 'live', label: 'Live', on: 'flash', off: 'flash-outline' },
  { key: 'matches', label: 'Matches', on: 'chatbubbles', off: 'chatbubbles-outline' },
  { key: 'profile', label: 'Profile', on: 'person', off: 'person-outline' },
] as const;

function TabBar({ active, pulse }: { active: (typeof TABS)[number]['key']; pulse: SharedValue<number> }) {
  const ring = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const tabs = TABS;
  return (
    <View style={m.tabBar}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <View key={t.key} style={m.tab}>
            {on ? <Animated.View pointerEvents="none" style={[m.tabGlow, ring]} /> : null}
            <Ionicons name={on ? t.on : t.off} size={20} color={on ? colors.brandBright : colors.textSecondary} />
            <AppText style={[m.tabLabel, on && m.tabLabelOn]}>{t.label}</AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = ScaledSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  main: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotOn: {
    width: 18,
    backgroundColor: colors.brandBright,
  },
  canvas: {
    position: 'absolute',
    width: CANVAS,
    height: CANVAS,
  },
  text: {
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: 420,
    minHeight: 132,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
    maxWidth: 420,
    width: '100%',
  },
  flex: {
    flex: 1,
  },
  skip: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 4,
  },
  skipSpacer: {
    height: 26,
  },
});

// Canvas styles are in canvas units (the whole mockup is scaled to fit), so no ScaledSheet here.
const m = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  glow: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderWidth: 2,
    borderColor: colors.brandBright,
  },
  logo: { width: 150, height: 150 },
  logoText: { color: colors.text, fontSize: 28, fontWeight: '900', marginTop: 16 },
  logoSub: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },
  screen: {
    flex: 1,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 14,
    paddingBottom: 0,
    gap: 10,
    overflow: 'hidden',
  },
  screenTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  chips: { flexDirection: 'row', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  chipOn: { borderColor: colors.brandBright, backgroundColor: 'rgba(124,58,237,0.25)' },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  goLive: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  goLiveText: { color: colors.white, fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  modeSwitch: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 14,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  modeTabOn: {
    backgroundColor: 'rgba(20,184,166,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.42)',
  },
  modeText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  modeTextOn: { color: colors.friend },
  friendTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(20,184,166,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.42)',
    marginTop: 10,
  },
  friendTagText: {
    color: colors.friend,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  friendNote: {
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 14,
  },
  friendNoteText: {
    color: colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: -14,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.elevated,
  },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 2 },
  tabGlow: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: 14,
    right: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.brandBright,
  },
  tabLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
  tabLabelOn: { color: colors.brandBright },
  card: {
    width: 190,
    height: 260,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.brandBright,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  lines: { width: '70%', alignItems: 'center', gap: 8 },
  line: { height: 9, borderRadius: 5, backgroundColor: colors.border },
  stamp: {
    position: 'absolute',
    top: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  stampLike: { left: 14, borderColor: colors.brandBright },
  stampPass: { right: 14, borderColor: colors.danger },
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  action: { alignItems: 'center', gap: 10 },
  actionSlot: { height: 78, justifyContent: 'center', alignItems: 'center' },
  actionBtn: { alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  rewind: { backgroundColor: 'rgba(255,176,32,0.16)', borderWidth: 2, borderColor: colors.warning },
  pass: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border },
  like: { backgroundColor: colors.brand },
  priority: { backgroundColor: '#0B0612', borderWidth: 2, borderColor: PRIORITY },
  likesStrip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
    padding: 10,
    gap: 8,
  },
  likesTitle: { color: colors.brandBright, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  likesRow: { flexDirection: 'row', gap: 8 },
  likeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(168,85,247,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card },
  avatarSm: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.card },
  chatLines: { flex: 1, gap: 6 },
  turn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(124,58,237,0.3)' },
  turnText: { color: colors.brandBright, fontSize: 10, fontWeight: '800' },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  planPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.brandBright,
    backgroundColor: 'rgba(124,58,237,0.25)',
  },
  planText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  proposal: {
    marginTop: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(34,229,139,0.4)',
    backgroundColor: colors.elevated,
    padding: 14,
    gap: 5,
  },
  proposalEyebrow: { color: colors.live, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  proposalVenue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  proposalMeta: { color: colors.textSecondary, fontSize: 13 },
  proposalLinks: { flexDirection: 'row', gap: 16, marginTop: 4 },
  proposalEdit: { color: colors.brandBright, fontSize: 13, fontWeight: '700' },
  proposalCancel: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profilePhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  strength: { flex: 1, gap: 6 },
  strengthText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  barFill: { width: '70%', height: '100%', backgroundColor: colors.brandBright },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  inviteCard: {
    width: 240,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.4)',
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  inviteLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  inviteCode: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: 3 },
  sharePill: { marginTop: 6, paddingHorizontal: 28, paddingVertical: 11, borderRadius: 20 },
  shareText: { color: colors.white, fontSize: 14, fontWeight: '800' },
});
