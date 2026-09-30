import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { env, personaClientConfigured } from '@/lib/env';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { VerificationStatus } from '@/types';

export const PERSONA_REDIRECT_PATH = 'persona';

export type PersonaInquiryResult = {
  inquiryId: string;
  status: VerificationStatus;
  rawStatus?: string;
};

function mapPersonaStatus(raw: string | null | undefined): VerificationStatus {
  const s = (raw ?? '').toLowerCase();
  if (s === 'completed' || s === 'approved') return 'verified';
  if (s === 'failed' || s === 'declined') return 'failed';
  if (s === 'needs_review' || s === 'needs-review') return 'manual_review';
  if (s === 'created' || s === 'pending' || s === 'started') return 'pending';
  return 'pending';
}

/** Deep-link redirect back into the app after hosted Persona flow. */
export function personaRedirectUri(): string {
  return Linking.createURL(PERSONA_REDIRECT_PATH);
}

/**
 * Build a Persona hosted / WebView verify URL.
 * Prefer server-created inquiryId + sessionToken when available.
 */
export function buildPersonaVerifyUrl(opts: {
  inquiryId?: string;
  sessionToken?: string;
  referenceId?: string;
  redirectUri?: string;
}): string | null {
  const redirectUri = opts.redirectUri ?? personaRedirectUri();
  const params = new URLSearchParams();
  params.set('is-webview', 'true');
  params.set('redirect-uri', redirectUri);

  if (opts.inquiryId) {
    params.set('inquiry-id', opts.inquiryId);
    if (opts.sessionToken) params.set('session-token', opts.sessionToken);
    return `https://withpersona.com/verify?${params.toString()}`;
  }

  if (!env.personaTemplateId) return null;

  params.set('inquiry-template-id', env.personaTemplateId);
  params.set('template-id', env.personaTemplateId);
  if (env.personaEnvironmentId) {
    params.set('environment-id', env.personaEnvironmentId);
  }
  if (opts.referenceId) params.set('reference-id', opts.referenceId);

  return `https://withpersona.com/verify?${params.toString()}`;
}

async function createInquiryOnServer(input: {
  nameFirst?: string;
  birthdate?: string;
}): Promise<{ inquiryId: string; sessionToken?: string }> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const projectId = env.firebaseProjectId || 'datetoday-e1331';
  const res = await fetch(`https://us-central1-${projectId}.cloudfunctions.net/createPersonaInquiry`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ nameFirst: input.nameFirst, birthdate: input.birthdate }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    inquiryId?: string;
    sessionToken?: string | null;
    error?: string;
  };
  if (!res.ok || !json.inquiryId) {
    throw new Error(json.error || `Could not start Persona (${res.status}).`);
  }
  return { inquiryId: json.inquiryId, sessionToken: json.sessionToken || undefined };
}

/**
 * Create the inquiry on our Cloud Function (API key stays server-side), then open hosted flow.
 * Fallback: template-only hosted URL, which needs an environment id to load.
 */
export async function createPersonaInquiry(input: {
  referenceId: string;
  nameFirst?: string;
  birthdate?: string; // YYYY-MM-DD
}): Promise<{ inquiryId: string; sessionToken?: string; verifyUrl: string } | null> {
  const redirectUri = personaRedirectUri();

  let serverError: Error | null = null;
  try {
    const created = await createInquiryOnServer(input);
    const verifyUrl = buildPersonaVerifyUrl({ ...created, redirectUri });
    if (verifyUrl) return { ...created, verifyUrl };
  } catch (error) {
    serverError = error instanceof Error ? error : new Error(String(error));
  }

  if (!env.personaEnvironmentId) {
    throw serverError ?? new Error('Could not start Persona.');
  }

  const verifyUrl = buildPersonaVerifyUrl({
    referenceId: input.referenceId,
    redirectUri,
  });
  if (!verifyUrl) return null;
  return { inquiryId: '', verifyUrl };
}

/**
 * Opens Persona hosted verification and resolves when the user returns via redirect
 * or dismisses the browser.
 */
export async function startPersonaVerification(input: {
  referenceId: string;
  nameFirst?: string;
  birthdate?: string;
}): Promise<PersonaInquiryResult | { canceled: true; inquiryId: string }> {
  if (!personaClientConfigured()) {
    throw new Error(
      'Persona template missing. Add EXPO_PUBLIC_PERSONA_TEMPLATE_ID (itmpl_…) to .env.',
    );
  }

  const created = await createPersonaInquiry(input);
  if (!created) {
    throw new Error(
      'Could not start Persona. Check EXPO_PUBLIC_PERSONA_TEMPLATE_ID.',
    );
  }

  const redirect = personaRedirectUri();
  const result = await WebBrowser.openAuthSessionAsync(created.verifyUrl, redirect);

  if (result.type !== 'success' || !result.url) {
    return { canceled: true, inquiryId: created.inquiryId };
  }

  const parsed = Linking.parse(result.url);
  const q = parsed.queryParams ?? {};
  const inquiryId =
    (typeof q['inquiry-id'] === 'string' && q['inquiry-id']) ||
    (typeof q.inquiryId === 'string' && q.inquiryId) ||
    created.inquiryId ||
    '';
  const rawStatus =
    (typeof q.status === 'string' && q.status) ||
    (typeof q['inquiry-status'] === 'string' && q['inquiry-status']) ||
    null;

  const status = rawStatus ? mapPersonaStatus(rawStatus) : inquiryId ? 'pending' : 'unverified';

  return {
    inquiryId,
    status: status === 'unverified' ? 'pending' : status,
    rawStatus: rawStatus ?? undefined,
  };
}

export { mapPersonaStatus };
