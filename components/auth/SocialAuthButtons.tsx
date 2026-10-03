import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  finishGoogleSignIn,
  googleConfigured,
  isAppleSignInAvailable,
  isExpoGo,
  signInWithApple,
  signInWithGoogleNative,
  useGoogleAuthRequest,
} from '@/features/auth/social';
import { env } from '@/lib/env';
import { friendlyError } from '@/lib/errors';
import { colors, radii } from '@/constants/theme';
import { ScaledSheet, rs } from '@/lib/scale';

type Props = {
  onSuccess: (result: {
    user: {
      id: string;
      email: string | null;
      displayName: string | null;
      isNewUser: boolean;
      provider: 'google' | 'apple';
    };
  }) => void;
  disabled?: boolean;
};

/**
 * AuthSession Google — iOS only (reverse-client-id scheme).
 * Android must use native Google Sign-In; Web-client AuthSession rejects custom schemes.
 */
function SocialAuthWithGoogleSession({ onSuccess, disabled }: Props) {
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [appleOk, setAppleOk] = useState(false);
  const [request, response, promptAsync] = useGoogleAuthRequest();
  const expoGo = isExpoGo();

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleOk);
  }, []);

  useEffect(() => {
    if (response?.type !== 'success') return;
    const idToken =
      response.params.id_token ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (response as any).authentication?.idToken;
    if (!idToken) {
      Alert.alert('Google sign-in failed', 'No ID token returned.');
      setBusy(null);
      return;
    }
    void (async () => {
      try {
        setBusy('google');
        const result = await finishGoogleSignIn(String(idToken));
        onSuccess(result);
      } catch (error) {
        Alert.alert(
          'Google sign-in failed',
          friendlyError(error, 'Try again'),
        );
      } finally {
        setBusy(null);
      }
    })();
  }, [response, onSuccess]);

  return (
    <SocialAuthChrome
      appleOk={appleOk}
      busy={busy}
      disabled={disabled}
      expoGo={expoGo}
      googleDim={!expoGo && !request}
      onApple={async () => {
        try {
          setBusy('apple');
          onSuccess(await signInWithApple());
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Try again';
          if (!/cancel/i.test(message)) Alert.alert('Apple sign-in failed', friendlyError(error, 'Try again'));
        } finally {
          setBusy(null);
        }
      }}
      onGoogle={async () => {
        if (!googleConfigured()) {
          Alert.alert(
            'Google not configured',
            'Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to .env.',
          );
          return;
        }
        try {
          setBusy('google');
          if (!expoGo) {
            try {
              onSuccess(await signInWithGoogleNative());
              return;
            } catch (nativeError) {
              const msg = nativeError instanceof Error ? nativeError.message : '';
              if (/Expo Go|development build/i.test(msg)) throw nativeError;
              if (!/Native module|null|undefined|not found/i.test(msg)) throw nativeError;
            }
          } else {
            Alert.alert(
              'Google needs a real build',
              'Google blocks Expo Go redirects. Use a simulator/dev build or TestFlight.\n\nApple Sign-In still works here.',
            );
            return;
          }
          await promptAsync();
        } catch (error) {
          Alert.alert(
            'Google sign-in failed',
            friendlyError(error, 'Try again'),
          );
        } finally {
          setBusy(null);
        }
      }}
    />
  );
}

/** Native Google only — Android + iOS without iosClientId. */
function SocialAuthNativeOnly({ onSuccess, disabled }: Props) {
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [appleOk, setAppleOk] = useState(false);
  const expoGo = isExpoGo();

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleOk);
  }, []);

  return (
    <SocialAuthChrome
      appleOk={appleOk}
      busy={busy}
      disabled={disabled}
      expoGo={expoGo}
      googleDim={false}
      onApple={async () => {
        try {
          setBusy('apple');
          onSuccess(await signInWithApple());
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Try again';
          if (!/cancel/i.test(message)) Alert.alert('Apple sign-in failed', friendlyError(error, 'Try again'));
        } finally {
          setBusy(null);
        }
      }}
      onGoogle={async () => {
        if (!googleConfigured()) {
          Alert.alert(
            'Google not configured',
            'Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to .env.',
          );
          return;
        }
        if (expoGo) {
          Alert.alert(
            'Google needs a real build',
            Platform.OS === 'android'
              ? 'Google Sign-In does not work in Expo Go. Install the Play / EAS build and try again.'
              : 'Google Sign-In does not work in Expo Go. Use a simulator/dev build or TestFlight.\n\nApple Sign-In still works here.',
          );
          return;
        }
        try {
          setBusy('google');
          onSuccess(await signInWithGoogleNative());
        } catch (error) {
          const raw = error instanceof Error ? error.message : '';
          if (/cancel/i.test(raw)) return;
          console.warn('[DateToday] Google sign-in failed', error);
          Alert.alert(
            'Google sign-in failed',
            friendlyError(error, 'Google sign-in didn’t work. Try again, or sign up with email.'),
          );
        } finally {
          setBusy(null);
        }
      }}
    />
  );
}

type ChromeProps = {
  appleOk: boolean;
  busy: 'apple' | 'google' | null;
  disabled?: boolean;
  expoGo: boolean;
  googleDim: boolean;
  onApple: () => void;
  onGoogle: () => void;
};

function SocialAuthChrome({
  appleOk,
  busy,
  disabled,
  googleDim,
  onApple,
  onGoogle,
}: ChromeProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.dividerRow}>
        <View style={styles.rule} />
        <Text style={styles.or}>or</Text>
        <View style={styles.rule} />
      </View>

      {appleOk ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={999}
          style={styles.appleBtn}
          onPress={() => {
            if (!disabled && busy !== 'apple') void onApple();
          }}
        />
      ) : Platform.OS === 'ios' ? (
        <Pressable
          style={[styles.btn, styles.appleFallback, (disabled || busy) && styles.dim]}
          disabled={Boolean(disabled || busy)}
          onPress={onApple}
        >
          {busy === 'apple' ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Ionicons name="logo-apple" size={rs(20)} color="#000" />
              <Text style={styles.appleLabel}>Continue with Apple</Text>
            </>
          )}
        </Pressable>
      ) : null}

      <Pressable
        style={[styles.btn, styles.googleBtn, (disabled || busy || googleDim) && styles.dim]}
        disabled={Boolean(disabled || busy)}
        onPress={onGoogle}
      >
        {busy === 'google' ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <>
            <Ionicons name="logo-google" size={rs(18)} color={colors.text} />
            <Text style={styles.googleLabel}>Continue with Google</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

export function SocialAuthButtons(props: Props) {
  // Android: native Google Sign-In only. Web AuthSession + custom scheme is rejected by Google.
  if (Platform.OS === 'android') {
    return <SocialAuthNativeOnly {...props} />;
  }
  if (!env.googleIosClientId) {
    return <SocialAuthNativeOnly {...props} />;
  }
  return <SocialAuthWithGoogleSession {...props} />;
}

const styles = ScaledSheet.create({
  wrap: {
    gap: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  or: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  appleBtn: {
    width: '100%',
    height: 54,
  },
  btn: {
    height: 54,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  appleFallback: {
    backgroundColor: '#FFFFFF',
  },
  appleLabel: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  googleBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  dim: {
    opacity: 0.55,
  },
});
