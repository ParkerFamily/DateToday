import { useEffect, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, View, type AlertButton } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import { colors, radii, spacing } from '@/constants/theme';

type PendingAlert = { title: string; message?: string; buttons: AlertButton[] };

const queue: PendingAlert[] = [];
let notify: (() => void) | null = null;

// React Native's Alert does nothing in a browser, so on web every Alert.alert lands in WebAlertHost.
if (Platform.OS === 'web') {
  Alert.alert = (title, message, buttons) => {
    queue.push({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
    notify?.();
  };
}

/** Web only: shows Alert.alert calls as an in-app dialog. Mount once at the root. */
export function WebAlertHost() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    notify = () => setVersion((v) => v + 1);
    if (queue.length) notify();
    return () => {
      notify = null;
    };
  }, []);

  const current = queue[0];
  if (Platform.OS !== 'web' || !current) return null;

  const press = (button: AlertButton) => {
    queue.shift();
    setVersion((v) => v + 1);
    button.onPress?.();
  };
  const cancel = current.buttons.find((b) => b.style === 'cancel');
  const stacked = current.buttons.length > 2;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => cancel && press(cancel)}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={cancel ? () => press(cancel) : undefined} />
        <View style={styles.card} accessibilityRole="alert">
          <AppText style={styles.title}>{current.title}</AppText>
          {current.message ? <AppText style={styles.message}>{current.message}</AppText> : null}
          <View style={stacked ? styles.stack : styles.row}>
            {current.buttons.map((button, i) => (
              <Pressable
                key={`${button.text ?? 'ok'}-${i}`}
                accessibilityRole="button"
                onPress={() => press(button)}
                style={({ pressed }) => [
                  styles.button,
                  !stacked && styles.rowButton,
                  button.style !== 'cancel' && button.style !== 'destructive' && styles.primary,
                  pressed && styles.pressed,
                ]}
              >
                <AppText
                  style={[
                    styles.buttonText,
                    button.style === 'cancel' && styles.cancelText,
                    button.style === 'destructive' && styles.destructiveText,
                  ]}
                >
                  {button.text ?? 'OK'}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(5, 3, 7, 0.7)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    padding: spacing.lg,
    gap: 10,
    borderRadius: radii.surface,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.elevated,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  message: { color: colors.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10, marginTop: spacing.sm },
  stack: { gap: 8, marginTop: spacing.sm },
  button: {
    minHeight: 46,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowButton: { flex: 1 },
  primary: { backgroundColor: colors.brand, borderColor: colors.brand },
  pressed: { opacity: 0.85 },
  buttonText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  cancelText: { color: colors.textSecondary },
  destructiveText: { color: colors.danger },
});
