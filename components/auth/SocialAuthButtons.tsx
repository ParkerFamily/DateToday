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
import { useRouter } from 'expo-router';
import { LinkRequiredError, PROVIDER_LABEL } from '@/features/auth/linking';
import {
  finishGoogleSignIn,
  type SocialAuthResult,
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
  onSuccess: (result: SocialAuthResult) => void;
  disabled?: boolean;
};

/** Tells people what happened to their sign-in methods, then hands off. */
export function announceSocialResult(result: SocialAuthResult) {
  const { linked, passwordRemoved, provider } = result.user;
  if (linked) {
    Alert.alert(
      `${PROVIDER_LABEL[linked]} connected`,
      `You can sign in with ${PROVIDER_LABEL[linked]} or ${PROVIDER_LABEL[provider]} from now on. Same account either way.`,
    );
  } else if (passwordRemoved) {
    Alert.alert(
      `Signed in with ${PROVIDER_LABEL[provider]}`,
      `Same DateToday account. ${PROVIDER_LABEL[provider]} replaced your old password, so sign in with ${PROVIDER_LABEL[provider]} — or set a new password in Settings › Account information.`,
    );
  }
}

/** Success and failure handling shared by every Google/Apple button. */
function useSocialHandlers(onSuccess: Props['onSuccess']) {
  const router = useRouter();
  const succeed = (result: SocialAuthResult) => {
    announceSocialResult(result);
    onSuccess(result);
  };
  const fail = (error: unknown, title: string, fallback = 'Try again') => {
    if (error instanceof LinkRequiredError) {
      // Same email as an existing account: log in that way first, then this one gets linked to it.
      router.replace({
        pathname: '/(auth)/login',
        params: { link: error.provider, email: error.email, methods: error.methods.join(',') },
      });
      return;
    }
    const message = error instanceof Error ? error.message : '';
    if (/cancel/i.test(message)) return;
    Alert.alert(title, friendlyError(error, fallback));
  };
  return { succeed, fail };
}

/**
 * AuthSession Google — iOS only (reverse-client-id scheme).
 * Android must use native Google Sign-In; Web-client AuthSession rejects custom schemes.
 */
function SocialAuthWithGoogleSession({ onSuccess, disabled }: Props) {
  const { succeed, fail } = useSocialHandlers(onSuccess);
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
        succeed(await finishGoogleSignIn(String(idToken)));
      } catch (error) {
        fail(error, 'Google sign-in failed');
      } finally {
        setBusy(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

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
          succeed(await signInWithApple());
        } catch (error) {
          fail(error, 'Apple sign-in failed');
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
              succeed(await signInWithGoogleNative());
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
          fail(error, 'Google sign-in failed');
        } finally {
          setBusy(null);
        }
      }}
    />
  );
}

/** Native Google only — Android + iOS without iosClientId. */
function SocialAuthNativeOnly({ onSuccess, disabled }: Props) {
  const { succeed, fail } = useSocialHandlers(onSuccess);
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
          succeed(await signInWithApple());
        } catch (error) {
          fail(error, 'Apple sign-in failed');
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
          succeed(await signInWithGoogleNative());
        } catch (error) {
          if (!(error instanceof LinkRequiredError)) console.warn('[DateToday] Google sign-in failed', error);
          fail(error, 'Google sign-in failed', 'Google sign-in didn’t work. Try again, or sign up with email.');
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
