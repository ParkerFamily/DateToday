import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/constants/theme';
import { rs, ScaledSheet } from '@/lib/scale';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface SwipeTutorialProps {
  visible: boolean;
  onSkip: () => void;
  onComplete: () => void;
}

type TutorialStep = 'swipe-right' | 'swipe-left' | 'match';

export function SwipeTutorial({ visible, onSkip, onComplete }: SwipeTutorialProps) {
  const [currentStep, setCurrentStep] = useState<TutorialStep>('swipe-right');
  const [reduceMotion, setReduceMotion] = useState(false);

  const handX = useSharedValue(0);
  const handOpacity = useSharedValue(0);
  const iconScale = useSharedValue(0);
  const iconOpacity = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      setReduceMotion(enabled ?? false);
    });
  }, []);

  useEffect(() => {
    if (!visible) return;

    // Reset animations when step changes
    handX.value = 0;
    handOpacity.value = 0;
    iconScale.value = 0;
    iconOpacity.value = 0;

    if (reduceMotion) {
      // For reduced motion: just show the icons without animation
      handOpacity.value = 1;
      iconOpacity.value = 1;
      iconScale.value = 1;
      return;
    }

    if (currentStep === 'swipe-right') {
      // Animate hand swiping right
      handOpacity.value = withTiming(1, { duration: 300 });
      handX.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 100 }),
          withTiming(80, { duration: 800, easing: Easing.out(Easing.cubic) }),
          withDelay(400, withTiming(0, { duration: 300 }))
        ),
        -1,
        false
      );
      // Show heart icon when hand reaches right
      iconOpacity.value = withDelay(
        600,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 300 }),
            withDelay(400, withTiming(0, { duration: 300 }))
          ),
          -1,
          false
        )
      );
      iconScale.value = withDelay(
        600,
        withRepeat(
          withSequence(
            withTiming(1.2, { duration: 300, easing: Easing.out(Easing.back(1.5)) }),
            withDelay(400, withTiming(0, { duration: 300 }))
          ),
          -1,
          false
        )
      );
    } else if (currentStep === 'swipe-left') {
      // Animate hand swiping left
      handOpacity.value = withTiming(1, { duration: 300 });
      handX.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 100 }),
          withTiming(-80, { duration: 800, easing: Easing.out(Easing.cubic) }),
          withDelay(400, withTiming(0, { duration: 300 }))
        ),
        -1,
        false
      );
      // Show X icon when hand reaches left
      iconOpacity.value = withDelay(
        600,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 300 }),
            withDelay(400, withTiming(0, { duration: 300 }))
          ),
          -1,
          false
        )
      );
      iconScale.value = withDelay(
        600,
        withRepeat(
          withSequence(
            withTiming(1.2, { duration: 300, easing: Easing.out(Easing.back(1.5)) }),
            withDelay(400, withTiming(0, { duration: 300 }))
          ),
          -1,
          false
        )
      );
    } else if (currentStep === 'match') {
      // Match animation - hearts coming together
      handOpacity.value = 0;
      iconOpacity.value = withTiming(1, { duration: 400 });
      iconScale.value = withSequence(
        withTiming(1.4, { duration: 400, easing: Easing.out(Easing.back(1.5)) }),
        withTiming(1, { duration: 300 })
      );
    }
  }, [visible, currentStep, reduceMotion, handX, handOpacity, iconScale, iconOpacity]);

  const handStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: handX.value }],
    opacity: handOpacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));

  const handleNext = useCallback(() => {
    if (currentStep === 'swipe-right') {
      setCurrentStep('swipe-left');
    } else if (currentStep === 'swipe-left') {
      setCurrentStep('match');
    } else {
      onComplete();
    }
  }, [currentStep, onComplete]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onSkip}
    >
      <View style={styles.container}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip tutorial"
        />
        
        <View style={styles.content} pointerEvents="box-none">
          <View style={styles.demoCard}>
            <View style={styles.cardContent}>
              <Ionicons name="person" size={rs(64)} color={colors.textSecondary} />
              <AppText style={styles.cardName}>Demo Profile</AppText>
            </View>

            {currentStep === 'swipe-right' && (
              <>
                <Animated.View style={[styles.hand, handStyle]}>
                  <Ionicons name="hand-right" size={rs(48)} color={colors.white} />
                </Animated.View>
                <Animated.View style={[styles.icon, styles.iconRight, iconStyle]}>
                  <Ionicons name="heart" size={rs(40)} color={colors.brandBright} />
                </Animated.View>
              </>
            )}

            {currentStep === 'swipe-left' && (
              <>
                <Animated.View style={[styles.hand, handStyle]}>
                  <Ionicons name="hand-right" size={rs(48)} color={colors.white} />
                </Animated.View>
                <Animated.View style={[styles.icon, styles.iconLeft, iconStyle]}>
                  <Ionicons name="close-circle" size={rs(40)} color={colors.danger} />
                </Animated.View>
              </>
            )}

            {currentStep === 'match' && (
              <Animated.View style={[styles.matchIcon, iconStyle]}>
                <View style={styles.matchHearts}>
                  <Ionicons name="heart" size={rs(32)} color={colors.brandBright} />
                  <Ionicons name="heart" size={rs(32)} color="#EC4899" />
                </View>
              </Animated.View>
            )}
          </View>

          <View style={styles.textBox} pointerEvents="box-none">
            {currentStep === 'swipe-right' && (
              <>
                <Ionicons name="heart" size={rs(32)} color={colors.brandBright} />
                <AppText style={styles.title}>Swipe right to like</AppText>
                <AppText style={styles.subtitle}>
                  Show interest in profiles you're attracted to
                </AppText>
              </>
            )}

            {currentStep === 'swipe-left' && (
              <>
                <Ionicons name="close-circle" size={rs(32)} color={colors.danger} />
                <AppText style={styles.title}>Swipe left to skip</AppText>
                <AppText style={styles.subtitle}>
                  Pass on profiles that aren't your type
                </AppText>
              </>
            )}

            {currentStep === 'match' && (
              <>
                <View style={styles.matchHearts}>
                  <Ionicons name="heart" size={rs(32)} color={colors.brandBright} />
                  <Ionicons name="heart" size={rs(32)} color="#EC4899" />
                </View>
                <AppText style={styles.title}>When you both like each other,</AppText>
                <AppText style={styles.title}>it's a match!</AppText>
                <AppText style={styles.subtitle}>
                  You'll be able to chat and make plans
                </AppText>
              </>
            )}
          </View>

          <View style={styles.buttons} pointerEvents="box-none">
            <Button
              label="Skip"
              variant="ghost"
              onPress={onSkip}
              style={styles.button}
            />
            <Button
              label={currentStep === 'match' ? 'Got It' : 'Next'}
              onPress={handleNext}
              style={styles.button}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = ScaledSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(5, 5, 8, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    gap: spacing.xl,
  },
  demoCard: {
    width: '80%',
    aspectRatio: 0.7,
    backgroundColor: colors.elevated,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: colors.brandBright,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
    shadowColor: colors.brandBright,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
  cardContent: {
    alignItems: 'center',
    gap: spacing.md,
  },
  cardName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  hand: {
    position: 'absolute',
    bottom: -20,
    left: '50%',
    marginLeft: -24,
  },
  icon: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
  },
  iconRight: {
    right: -30,
  },
  iconLeft: {
    left: -30,
  },
  matchIcon: {
    position: 'absolute',
    top: '50%',
    marginTop: -40,
  },
  matchHearts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  textBox: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  button: {
    flex: 1,
  },
});
