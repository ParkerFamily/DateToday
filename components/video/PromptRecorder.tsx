import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { VIDEO_DURATION } from '@/constants/videoPrompts';
import { colors, radii, spacing } from '@/constants/theme';

type Phase = 'permission' | 'ready' | 'countdown' | 'recording' | 'review';

interface PromptRecorderProps {
  promptText: string;
  eyebrow?: string;
  onKeep: (uri: string) => void;
  onClear?: () => void;
  existingUri?: string | null;
}

function LoopingPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.play();
  });
  return <VideoView player={player} style={styles.fill} contentFit="cover" nativeControls={false} />;
}

export function PromptRecorder({
  promptText,
  eyebrow = 'VIDEO PROMPT',
  onKeep,
  onClear,
  existingUri = null,
}: PromptRecorderProps) {
  const cameraRef = useRef<CameraView>(null);
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [phase, setPhase] = useState<Phase>(existingUri ? 'review' : 'ready');
  const [uri, setUri] = useState<string | null>(existingUri);
  const [count, setCount] = useState(VIDEO_DURATION.countdownFrom as number);
  const [elapsed, setElapsed] = useState(0);
  const recordingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const permitted = Boolean(camPerm?.granted && micPerm?.granted);

  useEffect(() => {
    if (existingUri) {
      setUri(existingUri);
      setPhase('review');
    }
  }, [existingUri]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordingRef.current) cameraRef.current?.stopRecording();
    };
  }, []);

  const ensurePermissions = async () => {
    const cam = camPerm?.granted ? camPerm : await requestCam();
    const mic = micPerm?.granted ? micPerm : await requestMic();
    return Boolean(cam.granted && mic.granted);
  };

  const clearTimers = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startCountdown = async () => {
    const ok = await ensurePermissions();
    if (!ok) {
      setPhase('permission');
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCount(VIDEO_DURATION.countdownFrom);
    setPhase('countdown');
    let n = VIDEO_DURATION.countdownFrom;
    clearTimers();
    timerRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearTimers();
        void beginRecording();
      } else {
        setCount(n);
        void Haptics.selectionAsync();
      }
    }, 1000);
  };

  const beginRecording = async () => {
    if (!cameraRef.current || recordingRef.current) return;
    setPhase('recording');
    setElapsed(0);
    recordingRef.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    clearTimers();
    timerRef.current = setInterval(() => {
      setElapsed((s) => {
        const next = s + 1;
        if (next >= VIDEO_DURATION.maxSeconds) {
          stopRecording();
        }
        return next;
      });
    }, 1000);

    try {
      const result = await cameraRef.current.recordAsync({
        maxDuration: VIDEO_DURATION.maxSeconds,
      });
      clearTimers();
      recordingRef.current = false;
      if (result?.uri) {
        setUri(result.uri);
        setPhase('review');
      } else {
        setPhase('ready');
      }
    } catch {
      clearTimers();
      recordingRef.current = false;
      setPhase('ready');
    }
  };

  const stopRecording = () => {
    if (!recordingRef.current) return;
    if (elapsed < VIDEO_DURATION.minSeconds && elapsed > 0) {
      // allow early stop only after min — otherwise keep going until user waits
      // soft: still stop if they insist via long press end; min is guidance
    }
    cameraRef.current?.stopRecording();
  };

  const tryAgain = () => {
    setUri(null);
    setElapsed(0);
    setPhase('ready');
    onClear?.();
  };

  if (!permitted && phase === 'permission') {
    return (
      <View style={styles.stage}>
        <View style={styles.perm}>
          <Ionicons name="videocam-outline" size={36} color={colors.brandBright} />
          <AppText style={styles.permTitle}>Camera + mic needed</AppText>
          <AppText style={styles.permBody}>
            Video prompts are recorded live in DateToday — no uploads, no old clips.
          </AppText>
          <Button label="Allow access" onPress={() => void startCountdown()} />
        </View>
      </View>
    );
  }

  if (phase === 'review' && uri) {
    return (
      <View style={styles.stage}>
        <LoopingPreview uri={uri} />
        <LinearScrim />
        <View style={styles.overlayTop}>
          <AppText style={styles.eyebrow}>{eyebrow}</AppText>
          <AppText style={styles.prompt}>“{promptText}”</AppText>
        </View>
        <View style={styles.overlayBottom}>
          <Button label="Keep it" onPress={() => onKeep(uri)} />
          <Pressable onPress={tryAgain} style={styles.retry}>
            <AppText style={styles.retryText}>Try again</AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stage}>
      {permitted ? (
        <CameraView
          ref={cameraRef}
          style={styles.fill}
          facing="front"
          mode="video"
          mirror
        />
      ) : (
        <View style={[styles.fill, styles.camFallback]}>
          <Ionicons name="videocam" size={40} color={colors.brandBright} />
        </View>
      )}
      <LinearScrim />
      <View style={styles.overlayTop}>
        <AppText style={styles.eyebrow}>{eyebrow}</AppText>
        <AppText style={styles.prompt}>“{promptText}”</AppText>
      </View>

      {phase === 'countdown' ? (
        <View style={styles.countdownWrap}>
          <AppText style={styles.countdown}>{count}</AppText>
          <AppText style={styles.countdownHint}>🎥</AppText>
        </View>
      ) : null}

      {phase === 'recording' ? (
        <View style={styles.recBadge}>
          <View style={styles.recDot} />
          <AppText style={styles.recText}>
            {elapsed}s · {VIDEO_DURATION.maxSeconds}s max
          </AppText>
        </View>
      ) : null}

      <View style={styles.overlayBottom}>
        {phase === 'recording' ? (
          <>
            <Pressable
              onPress={stopRecording}
              style={({ pressed }) => [styles.stopBtn, pressed && styles.pressed]}
            >
              <View style={styles.stopInner} />
            </Pressable>
            <AppText style={styles.cue}>
              {elapsed < VIDEO_DURATION.minSeconds
                ? `Keep going · ${VIDEO_DURATION.minSeconds}+ sec`
                : 'Tap to stop'}
            </AppText>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => void startCountdown()}
              style={({ pressed }) => [styles.recBtn, pressed && styles.pressed]}
            >
              <Ionicons name="radio-button-on" size={36} color={colors.danger} />
            </Pressable>
            <AppText style={styles.cue}>
              {VIDEO_DURATION.minSeconds}–{VIDEO_DURATION.maxSeconds} sec · Hold the vibe
            </AppText>
            {!permitted ? (
              <Pressable onPress={() => void ensurePermissions()}>
                <AppText style={styles.enable}>Enable camera</AppText>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function LinearScrim() {
  return (
    <View pointerEvents="none" style={styles.scrim}>
      <View style={styles.scrimTop} />
      <View style={styles.scrimBottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#0A0A0C',
    minHeight: 420,
  },
  fill: {
    ...StyleSheet.absoluteFill,
  },
  camFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#120E1C',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
  },
  scrimTop: {
    height: '28%',
    backgroundColor: 'rgba(5,5,6,0.55)',
  },
  scrimBottom: {
    height: '32%',
    backgroundColor: 'rgba(5,5,6,0.72)',
  },
  overlayTop: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    gap: 8,
  },
  eyebrow: {
    color: colors.brandBright,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  prompt: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  overlayBottom: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    alignItems: 'center',
    gap: 10,
  },
  countdownWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,5,6,0.35)',
  },
  countdown: {
    color: colors.text,
    fontSize: 96,
    fontWeight: '900',
  },
  countdownHint: {
    fontSize: 28,
    marginTop: -8,
  },
  recBadge: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(9,9,11,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  recText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  recBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9,9,11,0.35)',
  },
  stopBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopInner: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.danger,
  },
  cue: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  enable: {
    color: colors.brandBright,
    fontWeight: '700',
    marginTop: 4,
  },
  retry: {
    paddingVertical: 8,
  },
  retryText: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  perm: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  permTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  permBody: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
});
