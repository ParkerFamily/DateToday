import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AppText } from '@/components/ui/AppText';
import { colors } from '@/constants/theme';
import { ScaledSheet, rs } from '@/lib/scale';

const THUMB = rs(28);

interface RangeSliderProps {
  min: number;
  max: number;
  low: number;
  high: number;
  /** Called once when a drag ends, not on every step. */
  onChange: (low: number, high: number) => void;
  format?: (value: number) => string;
}

/** Two-thumb drag slider over whole-number steps. */
export function RangeSlider({ min, max, low, high, onChange, format = String }: RangeSliderProps) {
  const [trackW, setTrackW] = useState(0);
  const [live, setLive] = useState<[number, number]>([low, high]);
  const width = useSharedValue(0);
  const lowX = useSharedValue(0);
  const highX = useSharedValue(0);
  const lastLow = useSharedValue(low);
  const lastHigh = useSharedValue(high);
  const active = useSharedValue(0);
  const startX = useSharedValue(0);

  useEffect(() => {
    if (!trackW) return;
    lowX.value = ((low - min) / (max - min)) * trackW;
    highX.value = ((high - min) / (max - min)) * trackW;
    lastLow.value = low;
    lastHigh.value = high;
    setLive([low, high]);
  }, [low, high, min, max, trackW, lowX, highX, lastLow, lastHigh]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.max(0, e.nativeEvent.layout.width - THUMB);
    width.value = w;
    setTrackW(w);
  };

  const step = (l: number, h: number) => {
    setLive([l, h]);
    void Haptics.selectionAsync();
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-3, 3])
    .failOffsetY([-12, 12])
    .onBegin((e) => {
      const x = e.x - THUMB / 2;
      const dl = Math.abs(x - lowX.value);
      const dh = Math.abs(x - highX.value);
      if (dl !== dh) active.value = dl < dh ? 0 : 1;
      else active.value = x < lowX.value || highX.value >= width.value ? 0 : 1;
    })
    .onStart(() => {
      startX.value = active.value === 0 ? lowX.value : highX.value;
    })
    .onUpdate((e) => {
      const w = width.value;
      if (!w) return;
      let x = startX.value + e.translationX;
      if (active.value === 0) {
        x = Math.min(Math.max(x, 0), highX.value);
        lowX.value = x;
      } else {
        x = Math.min(Math.max(x, lowX.value), w);
        highX.value = x;
      }
      const v = Math.round(min + (x / w) * (max - min));
      if (active.value === 0 && v !== lastLow.value) {
        lastLow.value = v;
        runOnJS(step)(v, lastHigh.value);
      } else if (active.value === 1 && v !== lastHigh.value) {
        lastHigh.value = v;
        runOnJS(step)(lastLow.value, v);
      }
    })
    .onEnd(() => {
      const w = width.value;
      lowX.value = withTiming(((lastLow.value - min) / (max - min)) * w, { duration: 120 });
      highX.value = withTiming(((lastHigh.value - min) / (max - min)) * w, { duration: 120 });
      runOnJS(onChange)(lastLow.value, lastHigh.value);
    });

  const lowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: lowX.value }] }));
  const highStyle = useAnimatedStyle(() => ({ transform: [{ translateX: highX.value }] }));
  const fillStyle = useAnimatedStyle(() => ({
    left: lowX.value + THUMB / 2,
    width: highX.value - lowX.value,
  }));

  return (
    <View style={styles.wrap}>
      <AppText style={styles.value}>
        {format(live[0])} – {format(live[1])}
      </AppText>
      <GestureDetector gesture={pan}>
        <View style={styles.hit} onLayout={onLayout}>
          <View style={styles.track} />
          <Animated.View style={[styles.fill, fillStyle]} />
          <Animated.View style={[styles.thumb, lowStyle]} />
          <Animated.View style={[styles.thumb, highStyle]} />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = ScaledSheet.create({
  wrap: { gap: 6 },
  value: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  hit: { height: 44, justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  fill: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.brandBright,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.brandBright,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
