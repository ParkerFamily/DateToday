/** Must match PERSONA_REDIRECT_PATH in features/verification/persona.ts. */
const PERSONA_REDIRECT_PATH = 'persona';

/**
 * Android delivers Persona's redirect (datetoday://persona?…) to the router as well as to the
 * browser auth session. There's no screen for it: stay put while the auth session handles it,
 * or land on Verification (which re-checks Persona) when the redirect cold-started the app.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const bare = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/+/, '');
    if (bare === PERSONA_REDIRECT_PATH || bare.startsWith(`${PERSONA_REDIRECT_PATH}?`) || bare.startsWith(`${PERSONA_REDIRECT_PATH}/`)) {
      return initial ? '/settings/verification?check=1' : null;
    }
    return path;
  } catch {
    return path;
  }
}
