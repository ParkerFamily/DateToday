/**
 * Policy / consent versioning for DateToday.
 * Bump versions when material legal text changes; require re-consent when needed.
 *
 * Do not put unfinished counsel placeholders in user-facing copy. Entity name,
 * mailing address, governing law, and arbitration language belong in Terms only
 * after counsel (or the owner) fills them in — until then omit those sections.
 */

export const LEGAL_VERSIONS = {
  terms: '2026-10-17.v1',
  privacy: '2026-10-17.v1',
  communityGuidelines: '2026-10-17.v1',
  identityVerificationNotice: '2026-10-17.v1',
} as const;

export type LegalDocKey = keyof typeof LEGAL_VERSIONS;

/**
 * Public HTTPS URLs for App Store / Play metadata and in-app links.
 * Hosted from repo `docs/` via GitHub Pages (Project → Settings → Pages → /docs).
 * App Store Terms of Use (EULA) for auto-renewables: Apple Standard EULA below.
 */
export const LEGAL_URLS = {
  privacyPolicy: 'https://parkerfamily.github.io/DateToday/legal/privacy.html',
  /** Custom product terms (subscriptions, safety, eligibility). */
  termsOfService: 'https://parkerfamily.github.io/DateToday/legal/terms.html',
  /**
   * Apple Standard EULA — put this URL in App Store Connect App Description
   * (or attach a custom EULA in ASC) for Guideline 3.1.2.
   */
  appleStandardEula:
    'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
  communityGuidelines: 'https://parkerfamily.github.io/DateToday/legal/community.html',
  accountDeletion: 'https://parkerfamily.github.io/DateToday/delete-account.html',
  support: 'mailto:support@datetoday.app',
  /** Persona’s public privacy notice */
  personaPrivacy: 'https://withpersona.com/legal/privacy-policy',
} as const;

export const SUPPORT = {
  email: 'support@datetoday.app',
} as const;

export const APP_STORE_LINKS = {
  /** Open platform subscription management */
  appleSubscriptions: 'https://apps.apple.com/account/subscriptions',
  googleSubscriptions: 'https://play.google.com/store/account/subscriptions',
} as const;

export const CONSENT_COPY =
  'By continuing, you agree to DateToday’s Terms of Service and acknowledge the Privacy Policy and Community Guidelines. You must be 18 or older.';
