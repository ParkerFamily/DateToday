import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { AppText } from '@/components/ui/AppText';
import { rs } from '@/lib/scale';

export type CarouselItem =
  | { kind: 'photo'; uri: string }
  | { kind: 'video'; uri: string; label: string; prompt: string };

const SWIPE_MIN = 40;

/**
 * Tinder-style media: tap the right side for next, left for previous, or swipe sideways.
 * Vertical drags fall through to the parent ScrollView; Pressable children in `overlay` keep their taps.
 */
export function MediaCarousel({
  items,
  height,
  overlay,
  resetKey,
}: {
  items: CarouselItem[];
  height: number;
  overlay?: ReactNode;
  /** Changing this (e.g. the person's id) jumps back to the first item. */
  resetKey: string;
}) {
  const [index, setIndex] = useState(0);
  const frame = useRef<View>(null);
  const bounds = useRef({ x: 0, width: 1 });
  const count = items.length;

  useEffect(() => setIndex(0), [resetKey]);

  const step = useCallback(
    (dir: 1 | -1) => {
      setIndex((i) => {
        const next = i + dir;
        if (next < 0 || next >= count) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return i;
        }
        void Haptics.selectionAsync();
        return next;
      });
    },
    [count],
  );

  const measure = () => {
    frame.current?.measureInWindow((x, _y, width) => {
      bounds.current = { x, width: width || 1 };
    });
  };

  const onTap = (e: GestureResponderEvent) => {
    if (count < 2) return;
    const rel = (e.nativeEvent.pageX - bounds.current.x) / bounds.current.width;
    step(rel < 0.35 ? -1 : 1);
  };

  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-15, 15])
    .failOffsetY([-12, 12])
    .onEnd((e) => {
      if (count < 2) return;
      if (e.translationX <= -SWIPE_MIN) step(1);
      else if (e.translationX >= SWIPE_MIN) step(-1);
    });

  const item = items[Math.min(index, Math.max(0, count - 1))];

  return (
    <GestureDetector gesture={swipe}>
      <View ref={frame} onLayout={measure} style={{ height }}>
        <Pressable
          onPress={onTap}
          style={StyleSheet.absoluteFill}
          accessibilityRole="adjustable"
          accessibilityLabel={`Photo ${index + 1} of ${count}`}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        >
          {item?.kind === 'video' ? (
            <CarouselVideo key={`${resetKey}-${index}`} item={item} overlay={overlay} />
          ) : (
            <>
              {item ? (
                <Image
                  source={{ uri: item.uri }}
                  style={StyleSheet.absoluteFill}
                  cachePolicy="memory-disk"
                  contentFit="cover"
                  transition={120}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.empty]} />
              )}
              {overlay}
            </>
          )}
        </Pressable>
        {count > 1 ? (
          <>
            <LinearGradient
              colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']}
              style={styles.barsScrim}
              pointerEvents="none"
            />
            <View style={styles.bars} pointerEvents="none">
              {items.map((_, i) => (
                <View key={i} style={[styles.bar, i === index && styles.barOn]} />
              ))}
            </View>
          </>
        ) : null}
      </View>
    </GestureDetector>
  );
}

function CarouselVideo({
  item,
  overlay,
}: {
  item: Extract<CarouselItem, { kind: 'video' }>;
  overlay?: ReactNode;
}) {
  const player = useVideoPlayer(item.uri, (p) => {
    p.loop = true;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  useFocusEffect(
    useCallback(
      () => () => {
        try {
          player.pause();
        } catch {}
      },
      [player],
    ),
  );

  const toggle = () => {
    try {
      if (player.playing) player.pause();
      else player.play();
    } catch {}
  };

  return (
    <>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        surfaceType="textureView"
      />
      {overlay}
      <View style={styles.videoCaption} pointerEvents="none">
        <AppText style={styles.videoLabel}>🎥 {item.label}</AppText>
        <AppText style={styles.videoPrompt} numberOfLines={2}>
          “{item.prompt}”
        </AppText>
      </View>
      <View style={styles.center} pointerEvents="box-none">
        <Pressable
          onPress={toggle}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
          style={[styles.playBtn, isPlaying && styles.playBtnQuiet]}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={rs(30)}
            color="#fff"
            style={isPlaying ? undefined : styles.playIcon}
          />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  empty: { backgroundColor: '#14101C' },
  bars: {
    position: 'absolute',
    top: rs(8),
    left: rs(10),
    right: rs(10),
    flexDirection: 'row',
    gap: rs(4),
  },
  barsScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: rs(56) },
  bar: {
    flex: 1,
    height: rs(3.5),
    borderRadius: rs(2),
    backgroundColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 0 },
  },
  barOn: { backgroundColor: '#fff' },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: rs(64),
    height: rs(64),
    borderRadius: rs(32),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  playBtnQuiet: { opacity: 0.35 },
  playIcon: { marginLeft: rs(4) },
  videoCaption: {
    position: 'absolute',
    top: rs(100),
    left: rs(16),
    right: rs(16),
    gap: rs(4),
  },
  videoLabel: { color: '#fff', fontSize: rs(12), fontWeight: '800', letterSpacing: 0.6 },
  videoPrompt: {
    color: '#fff',
    fontSize: rs(17),
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 6,
  },
});
