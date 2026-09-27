import { friendlyError } from '@/lib/errors';

describe('friendlyError', () => {
  it('maps Firebase auth codes from the error message', () => {
    expect(friendlyError(new Error('Firebase: Error (auth/email-already-in-use).'))).toBe(
      'That email already has an account. Try logging in instead.',
    );
  });

  it('maps codes from the error object', () => {
    expect(friendlyError({ code: 'auth/invalid-credential', message: 'x' })).toBe(
      'Email or password is incorrect.',
    );
    expect(friendlyError({ code: 'permission-denied', message: 'Missing or insufficient permissions.' })).toBe(
      'You don’t have permission to do that.',
    );
  });

  it('never leaks unknown Firebase internals', () => {
    expect(friendlyError(new Error('Firebase: Error (auth/some-new-code).'), 'Try again')).toBe('Try again');
  });

  it('keeps our own readable messages', () => {
    expect(friendlyError(new Error('That profile is no longer available.'))).toBe(
      'That profile is no longer available.',
    );
  });
});
