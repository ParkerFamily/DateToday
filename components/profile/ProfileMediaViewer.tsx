import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/constants/theme';

const { height: SCREEN_H } = Dimensions.get('window');

export type MediaViewerItem =
  | { type: 'photo'; uri: string; caption?: string | null }
  | {
      type: 'video';
      uri: string;
      /** Prompt text shown as on-video caption */
      caption?: string | null;
      eyebrow?: string | null;
    };

function CaptionedVideo({
  uri,
  caption,
  eyebrow,
}: {
  uri: string;
  caption?: string | null;
  eyebrow?: string | null;
}) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.play();
  });

  return (
    <View style={styles.mediaFill}>
      <VideoView
        player={player}
        style={styles.mediaFill}
        contentFit="cover"
        nativeControls
      />
      {(eyebrow || caption) && (
        <View style={styles.captionBlock} pointerEvents="none">
          {eyebrow ? <AppText style={styles.captionEyebrow}>{eyebrow}</AppText> : null}
          {caption ? <AppText style={styles.captionText}>“{caption}”</AppText> : null}
        </View>
      )}
    </View>
  );
}

/**
 * Full-screen photo / video preview — same surface for own profile and others.
 * Videos show the curated prompt as an auto caption overlay.
 */
export function ProfileMediaViewer({
  visible,
  items,
  initialIndex = 0,
  onClose,
}: {
  visible: boolean;
  items: MediaViewerItem[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIndex(Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1)));
  }, [visible, initialIndex, items.length]);

  if (!items.length) return null;
  const item = items[index];

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <AppText style={styles.closeLabel}>Close</AppText>
          </Pressable>
          <AppText style={styles.counter}>
            {index + 1} / {items.length}
          </AppText>
          <View style={styles.closeBtn} />
        </View>

        <View style={styles.stage}>
          {item?.type === 'photo' ? (
            <View style={styles.mediaFill}>
              <Image source={{ uri: item.uri }} style={styles.mediaFill} resizeMode="contain" />
            </View>
          ) : item?.type === 'video' ? (
            <CaptionedVideo uri={item.uri} caption={item.caption} eyebrow={item.eyebrow} />
          ) : null}
        </View>

        {items.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbs}
          >
            {items.map((m, i) => (
              <Pressable
                key={`${m.type}-${m.uri}-${i}`}
                onPress={() => setIndex(i)}
                style={[styles.thumb, i === index && styles.thumbOn]}
              >
                {m.type === 'photo' ? (
                  <Image source={{ uri: m.uri }} style={styles.thumbImg} />
                ) : (
                  <View style={[styles.thumbImg, styles.thumbVideo]}>
                    <AppText style={styles.thumbVideoLabel}>▶</AppText>
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

/**
 * Inline video tile with prompt caption — used on profile / media screens.
 */
export function PromptVideoTile({
  uri,
  caption,
  eyebrow,
  onPress,
}: {
  uri: string | null | undefined;
  caption?: string | null;
  eyebrow?: string | null;
  onPress?: () => void;
}) {
  if (!uri) {
    return (
      <Pressable onPress={onPress} style={styles.tileEmpty}>
        {eyebrow ? <AppText style={styles.tileEyebrow}>{eyebrow}</AppText> : null}
        <AppText style={styles.tileEmptyLabel}>Tap to record</AppText>
        {caption ? (
          <AppText style={styles.tileEmptyCaption} numberOfLines={2}>
            “{caption}”
          </AppText>
        ) : null}
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={styles.tile}>
      <CaptionedVideo uri={uri} caption={caption} eyebrow={eyebrow} />
      <View style={styles.tilePlayHint}>
        <AppText style={styles.tilePlayLabel}>Preview</AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  closeBtn: {
    minWidth: 64,
  },
  closeLabel: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  counter: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  stage: {
    flex: 1,
    justifyContent: 'center',
  },
  mediaFill: {
    width: '100%',
    height: '100%',
  },
  captionBlock: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    gap: 8,
  },
  captionEyebrow: {
    color: colors.brandBright,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  captionText: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  thumbs: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 8,
  },
  thumb: {
    width: 56,
    height: 72,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    marginRight: 8,
  },
  thumbOn: {
    borderColor: colors.brandBright,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbVideo: {
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbVideoLabel: {
    color: colors.text,
    fontSize: 16,
  },
  tile: {
    height: Math.min(SCREEN_H * 0.42, 360),
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tileEmpty: {
    height: 200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: 8,
  },
  tileEyebrow: {
    color: colors.brandBright,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tileEmptyLabel: {
    color: colors.text,
    fontWeight: '700',
  },
  tileEmptyCaption: {
    color: colors.textSecondary,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  tilePlayHint: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  tilePlayLabel: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
});
