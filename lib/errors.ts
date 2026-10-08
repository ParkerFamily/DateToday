/**
 * Turn any thrown value into a message that's safe to show people.
 * Firebase errors look like "Firebase: Error (auth/email-already-in-use)." — never show those raw.
 */
const FIREBASE_MESSAGES: Record<string, string> = {
  // Auth
  'auth/email-already-in-use': 'That email already has an account. Try logging in instead.',
  'auth/credential-already-in-use': 'That account is already linked to another DateToday profile.',
  'auth/provider-already-linked': 'That sign-in method is already connected to your account.',  'auth/account-exists-with-different-credential':
    'You already signed up with this email another way. Log in with that method instead.',
  'auth/invalid-email': 'That email address doesn’t look right.',
  'auth/missing-email': 'Enter your email address.',
  'auth/weak-password': 'Choose a stronger password — at least 6 characters.',
  'auth/missing-password': 'Enter your password.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/invalid-login-credentials': 'Email or password is incorrect.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/user-disabled': 'This account has been disabled. Contact support if you think this is a mistake.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/requires-recent-login': 'For your security, log in again and then retry.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/operation-not-allowed': 'That sign-in method isn’t available right now.',
  'auth/internal-error': 'Something went wrong on our end. Try again in a moment.',
  // Firestore / Storage / Functions
  'permission-denied': 'You don’t have permission to do that.',
  unauthenticated: 'Your session expired. Log in again.',
  unavailable: 'No connection. Check your internet and try again.',
  'deadline-exceeded': 'That took too long. Check your connection and try again.',
  'resource-exhausted': 'Too many requests. Try again in a moment.',
  'not-found': 'That’s no longer available.',
  'already-exists': 'That already exists.',
  'storage/unauthorized': 'Upload was blocked. Log in again and retry.',
  'storage/canceled': 'Upload was cancelled.',
  'storage/retry-limit-exceeded': 'Upload timed out. Check your connection and try again.',
};

function firebaseCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code: unknown }).code ?? '');
    if (code) return code.replace(/^firestore\//, '').replace(/^functions\//, '');
  }
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const match = /\(([a-z-]+\/[a-z-]+|[a-z-]+)\)/.exec(message);
  return match?.[1] ?? null;
}

export function isEmailInUse(error: unknown): boolean {
  return firebaseCode(error) === 'auth/email-already-in-use';
}

/** Wrong password, or no password on that account at all (it signs in with Google/Apple). */
export function isWrongPassword(error: unknown): boolean {
  const code = firebaseCode(error);
  return (
    code === 'auth/wrong-password' ||
    code === 'auth/invalid-credential' ||
    code === 'auth/invalid-login-credentials'
  );
}

export function friendlyError(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  const code = firebaseCode(error);
  if (code && FIREBASE_MESSAGES[code]) return FIREBASE_MESSAGES[code];

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!message) return fallback;
  if (/network|fetch failed|timed? ?out/i.test(message)) return FIREBASE_MESSAGES.unavailable;
  // Anything still mentioning Firebase internals isn't user copy.
  if (/firebase|firestore|\b[a-z]+\/[a-z-]+\b/i.test(message)) return fallback;
  return message;
}
