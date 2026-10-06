import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoContentFit } from 'expo-video';
import { useCallback } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { rs } from '@/lib/scale';

/** Never autoplays: shows the first frame with a play button, tap toggles play / pause. */
export function TapToPlayVideo({
  uri,
  style,
  contentFit = 'cover',
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: VideoContentFit;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  // Screens stay mounted under the next one in the stack — stop when this one is covered.
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
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
      style={style}
    >
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={contentFit} nativeControls={false} />
      {isPlaying ? null : <PlayBadge />}
    </Pressable>
  );
}

export function PlayBadge() {
  return (
    <View pointerEvents="none" style={styles.center}>
      <View style={styles.badge}>
        <Ionicons name="play" size={rs(30)} color="#fff" style={styles.icon} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: rs(64),
    height: rs(64),
    borderRadius: rs(32),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  // The play glyph is visually left-heavy; nudge it to look centered.
  icon: { marginLeft: rs(4) },
});
