import React, { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Image,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedImage = Animated.createAnimatedComponent(Image);

const NEON_ICON = require('../../assets/images/dt-neon-transparent.png');

const VB = 320;
const CX = 160;
const CY = 158;

/**
 * Abstract incomplete heart ribbons — two independent cubic paths.
 * t: 0 = open trails from opposite sides, 1 = brief heart suggestion.
 */
function leftRibbonD(t: number, pullX: number, pullY: number, strength: number) {
  'worklet';
  // Open: descending from upper-left. Heart: left lobe → bottom tip.
  const sx = interpolate(t, [0, 1], [12, 88], Extrapolation.CLAMP);
  const sy = interpolate(t, [0, 1], [28, 86], Extrapolation.CLAMP);
  const c1x =
    interpolate(t, [0, 1], [36, 42], Extrapolation.CLAMP) + pullX * strength * 0.5;
  const c1y =
    interpolate(t, [0, 1], [96, 28], Extrapolation.CLAMP) + pullY * strength * 0.3;
  const c2x =
    interpolate(t, [0, 1], [58, 78], Extrapolation.CLAMP) + pullX * strength * 0.8;
  const c2y =
    interpolate(t, [0, 1], [188, 132], Extrapolation.CLAMP) + pullY * strength * 0.65;
  const mx = interpolate(t, [0, 1], [96, 118], Extrapolation.CLAMP);
  const my = interpolate(t, [0, 1], [236, 188], Extrapolation.CLAMP);
  const ex = interpolate(t, [0, 1], [128, 160], Extrapolation.CLAMP);
  const ey = interpolate(t, [0, 1], [276, 252], Extrapolation.CLAMP);
  return `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${mx} ${my} S ${ex - 8 * (1 - t)} ${ey - 10 * t} ${ex} ${ey}`;
}

function rightRibbonD(t: number, pullX: number, pullY: number, strength: number) {
  'worklet';
  const sx = interpolate(t, [0, 1], [308, 232], Extrapolation.CLAMP);
  const sy = interpolate(t, [0, 1], [28, 86], Extrapolation.CLAMP);
  const c1x =
    interpolate(t, [0, 1], [284, 278], Extrapolation.CLAMP) + pullX * strength * 0.5;
  const c1y =
    interpolate(t, [0, 1], [96, 28], Extrapolation.CLAMP) + pullY * strength * 0.3;
  const c2x =
    interpolate(t, [0, 1], [262, 242], Extrapolation.CLAMP) + pullX * strength * 0.8;
  const c2y =
    interpolate(t, [0, 1], [188, 132], Extrapolation.CLAMP) + pullY * strength * 0.65;
  const mx = interpolate(t, [0, 1], [224, 202], Extrapolation.CLAMP);
  const my = interpolate(t, [0, 1], [236, 188], Extrapolation.CLAMP);
  const ex = interpolate(t, [0, 1], [192, 160], Extrapolation.CLAMP);
  const ey = interpolate(t, [0, 1], [276, 252], Extrapolation.CLAMP);
  return `M ${sx} ${sy} C ${c1x} ${c1y} ${c2x} ${c2y} ${mx} ${my} S ${ex + 8 * (1 - t)} ${ey - 10 * t} ${ex} ${ey}`;
}

function heartFormAmount(phase: number) {
  'worklet';
  return interpolate(
    phase,
    [0, 0.22, 0.38, 0.52, 0.72, 1],
    [0, 0.35, 1, 1, 0.25, 0],
    Extrapolation.CLAMP,
  );
}

function triggerSoftHaptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

interface BrandHeartLightProps {
  iconSize?: number;
}

export function BrandHeartLight({ iconSize = 188 }: BrandHeartLightProps) {
  const [reducedMotion, setReducedMotion] = useState(false);

  const phase = useSharedValue(0);
  const dash = useSharedValue(0);
  const touchX = useSharedValue(CX);
  const touchY = useSharedValue(CY);
  const touching = useSharedValue(0);
  const glow = useSharedValue(0.35);
  const iconScale = useSharedValue(1);
  const hapticArmed = useSharedValue(1);
  const layoutW = useSharedValue(320);
  const layoutH = useSharedValue(320);
  const sideSv = useSharedValue(320);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(phase);
      cancelAnimation(dash);
      phase.value = 0.45;
      dash.value = 40;
      return;
    }

    phase.value = 0;
    phase.value = withRepeat(
      withTiming(1, { duration: 9200, easing: Easing.inOut(Easing.sin) }),
      -1,
      false,
    );

    dash.value = 0;
    dash.value = withRepeat(
      withTiming(280, { duration: 4200, easing: Easing.linear }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(phase);
      cancelAnimation(dash);
    };
  }, [reducedMotion, phase, dash]);

  const form = useDerivedValue(() => heartFormAmount(phase.value));

  const proximity = useDerivedValue(() => {
    const dx = touchX.value - CX;
    const dy = touchY.value - CY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const near = interpolate(dist, [28, 110], [1, 0], Extrapolation.CLAMP);
    return near * Math.max(touching.value, form.value * 0.55);
  });

  useAnimatedReaction(
    () => proximity.value,
    (p) => {
      glow.value = withTiming(0.32 + p * 0.55, { duration: 180 });
      iconScale.value = withSpring(1 + p * 0.045, { damping: 18, stiffness: 220 });

      if (p > 0.72 && hapticArmed.value && touching.value > 0.5) {
        hapticArmed.value = 0;
        runOnJS(triggerSoftHaptic)();
      } else if (p < 0.35) {
        hapticArmed.value = 1;
      }
    },
  );

  const leftPull = useDerivedValue(() => {
    if (touching.value < 0.01) return { x: 0, y: 0, s: 0 };
    const prefer =
      touchX.value <= CX + 18
        ? 1
        : interpolate(touchX.value, [CX, CX + 90], [0.55, 0.12], Extrapolation.CLAMP);
    return {
      x: (touchX.value - 90) * 0.22,
      y: (touchY.value - CY) * 0.28,
      s: prefer * touching.value,
    };
  });

  const rightPull = useDerivedValue(() => {
    if (touching.value < 0.01) return { x: 0, y: 0, s: 0 };
    const prefer =
      touchX.value >= CX - 18
        ? 1
        : interpolate(touchX.value, [CX - 90, CX], [0.12, 0.55], Extrapolation.CLAMP);
    return {
      x: (touchX.value - 230) * 0.22,
      y: (touchY.value - CY) * 0.28,
      s: prefer * touching.value,
    };
  });

  const leftGlowProps = useAnimatedProps(() => {
    const pull = leftPull.value;
    return {
      d: leftRibbonD(form.value, pull.x, pull.y, pull.s),
      strokeDashoffset: -dash.value,
      opacity: 0.22 + form.value * 0.18 + pull.s * 0.12,
    };
  });

  const leftCoreProps = useAnimatedProps(() => {
    const pull = leftPull.value;
    return {
      d: leftRibbonD(form.value, pull.x, pull.y, pull.s),
      strokeDashoffset: -dash.value * 1.05,
      opacity: 0.55 + form.value * 0.35 + pull.s * 0.2,
    };
  });

  const rightGlowProps = useAnimatedProps(() => {
    const pull = rightPull.value;
    return {
      d: rightRibbonD(form.value, pull.x, pull.y, pull.s),
      strokeDashoffset: dash.value,
      opacity: 0.22 + form.value * 0.18 + pull.s * 0.12,
    };
  });

  const rightCoreProps = useAnimatedProps(() => {
    const pull = rightPull.value;
    return {
      d: rightRibbonD(form.value, pull.x, pull.y, pull.s),
      strokeDashoffset: dash.value * 1.05,
      opacity: 0.55 + form.value * 0.35 + pull.s * 0.2,
    };
  });

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
    opacity: 0.88 + glow.value * 0.12,
  }));

  const bloomStyle = useAnimatedStyle(() => ({
    opacity: 0.28 + glow.value * 0.55,
    transform: [{ scale: 0.92 + glow.value * 0.18 }],
  }));

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin((e) => {
          touching.value = withTiming(1, { duration: 120 });
          const scale = sideSv.value / VB;
          const ox = (layoutW.value - sideSv.value) / 2;
          const oy = (layoutH.value - sideSv.value) / 2;
          touchX.value = (e.x - ox) / scale;
          touchY.value = (e.y - oy) / scale;
        })
        .onUpdate((e) => {
          const scale = sideSv.value / VB;
          const ox = (layoutW.value - sideSv.value) / 2;
          const oy = (layoutH.value - sideSv.value) / 2;
          touchX.value = (e.x - ox) / scale;
          touchY.value = (e.y - oy) / scale;
        })
        .onFinalize(() => {
          touching.value = withTiming(0, { duration: 420 });
          touchX.value = withSpring(CX, { damping: 20, stiffness: 90 });
          touchY.value = withSpring(CY, { damping: 20, stiffness: 90 });
        }),
    [touching, touchX, touchY, layoutW, layoutH, sideSv],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    layoutW.value = width;
    layoutH.value = height;
    sideSv.value = Math.min(width, height);
  };

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.root} onLayout={onLayout} accessibilityLabel="DateToday brand mark">
        <Animated.View style={[styles.bloom, bloomStyle]} pointerEvents="none">
          <LinearGradient
            colors={['rgba(168,85,247,0.45)', 'rgba(124,58,237,0.12)', 'transparent']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0.35 }}
            end={{ x: 0.5, y: 1 }}
          />
        </Animated.View>

        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${VB} ${VB}`}
          preserveAspectRatio="xMidYMid meet"
          style={styles.svg}
          pointerEvents="none"
        >
          <Defs>
            <RadialGradient id="atm" cx="50%" cy="46%" r="48%">
              <Stop offset="0%" stopColor="#A855F7" stopOpacity="0.28" />
              <Stop offset="55%" stopColor="#7C3AED" stopOpacity="0.08" />
              <Stop offset="100%" stopColor="#09090B" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Path d={`M0,0 H${VB} V${VB} H0 Z`} fill="url(#atm)" />

          <AnimatedPath
            animatedProps={leftGlowProps}
            stroke="#C084FC"
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray="56 220"
          />
          <AnimatedPath
            animatedProps={rightGlowProps}
            stroke="#A855F7"
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray="56 220"
          />
          <AnimatedPath
            animatedProps={leftCoreProps}
            stroke="#F5E1FF"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray="34 242"
          />
          <AnimatedPath
            animatedProps={rightCoreProps}
            stroke="#E9D5FF"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray="34 242"
          />
        </Svg>

        <AnimatedImage
          source={NEON_ICON}
          style={[styles.icon, { width: iconSize, height: iconSize }, iconStyle]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 240,
  },
  bloom: {
    position: 'absolute',
    width: '78%',
    aspectRatio: 1,
    borderRadius: 999,
    overflow: 'hidden',
  },
  svg: {
    ...StyleSheet.absoluteFill,
  },
  icon: {
    zIndex: 2,
  },
});
