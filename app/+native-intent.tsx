/** Must match PERSONA_REDIRECT_PATH in features/verification/persona.ts. */
const PERSONA_REDIRECT_PATH = 'persona';
/** Must match RETURN_URL in lib/billing/webCheckout.ts. */
const CHECKOUT_RETURN_PATH = 'checkout';

const isPath = (bare: string, path: string) =>
  bare === path || bare.startsWith(`${path}?`) || bare.startsWith(`${path}/`);

/**
 * Android delivers browser-session redirects (datetoday://persona?…, datetoday://checkout?…) to the
 * router as well as to the auth session. There's no screen for them: stay put while the session
 * handles it, or land on the right screen when the redirect cold-started the app.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const bare = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/+/, '');
    if (isPath(bare, PERSONA_REDIRECT_PATH)) {
      return initial ? '/settings/verification?check=1' : null;
    }
    if (isPath(bare, CHECKOUT_RETURN_PATH)) {
      return initial ? '/paywall' : null;
    }
    return path;
  } catch {
    return path;
  }
}
