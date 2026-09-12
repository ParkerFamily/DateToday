import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { env, personaClientConfigured } from '@/lib/env';
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

/**
 * Create a sandbox inquiry via Persona API (dev), then open hosted flow.
 * Falls back to template-id hosted URL if API create isn't available.
 */
export async function createPersonaInquiry(input: {
  referenceId: string;
  nameFirst?: string;
  birthdate?: string; // YYYY-MM-DD
}): Promise<{ inquiryId: string; sessionToken?: string; verifyUrl: string } | null> {
  const redirectUri = personaRedirectUri();

  // Preferred: create inquiry with sandbox API key so we get a real inquiry-id.
  const sandboxKey = env.personaSandboxApiKey;
  if (sandboxKey?.startsWith('persona_sandbox_') && env.personaTemplateId) {
    try {
      const fields: Record<string, string> = {};
      if (input.nameFirst?.trim()) fields['name-first'] = input.nameFirst.trim();
      if (input.birthdate?.trim()) fields.birthdate = input.birthdate.trim();

      const res = await fetch('https://api.withpersona.com/api/v1/inquiries', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sandboxKey}`,
          'Persona-Version': '2023-01-05',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            attributes: {
              'inquiry-template-id': env.personaTemplateId,
              'reference-id': input.referenceId,
              ...(Object.keys(fields).length ? { fields } : {}),
            },
          },
        }),
      });

      const json = (await res.json()) as {
        data?: {
          id?: string;
          attributes?: { 'session-token'?: string | null };
        };
        meta?: { 'session-token'?: string | null };
        errors?: { title?: string; details?: string }[];
      };

      if (res.ok && json.data?.id) {
        const inquiryId = json.data.id;
        const sessionToken =
          json.meta?.['session-token'] ||
          json.data.attributes?.['session-token'] ||
          undefined;
        const verifyUrl = buildPersonaVerifyUrl({
          inquiryId,
          sessionToken: sessionToken || undefined,
          redirectUri,
        });
        if (verifyUrl) {
          return { inquiryId, sessionToken: sessionToken || undefined, verifyUrl };
        }
      }
    } catch {
      // Fall through to template hosted URL.
    }
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
}): Promise<PersonaInquiryResult | { canceled: true }> {
  if (!personaClientConfigured()) {
    throw new Error(
      'Persona template missing. Add EXPO_PUBLIC_PERSONA_TEMPLATE_ID (itmpl_…) to .env.',
    );
  }

  const created = await createPersonaInquiry(input);
  if (!created) {
    throw new Error(
      'Could not start Persona. Check EXPO_PUBLIC_PERSONA_TEMPLATE_ID and sandbox API key.',
    );
  }

  const redirect = personaRedirectUri();
  const result = await WebBrowser.openAuthSessionAsync(created.verifyUrl, redirect);

  if (result.type !== 'success' || !result.url) {
    return { canceled: true };
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
