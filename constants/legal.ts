/**
 * Policy / consent versioning for DateToday.
 * Bump versions when material legal text changes; require re-consent when needed.
 *
 * Placeholders marked [LEGAL REVIEW REQUIRED] must be confirmed by counsel / owner.
 */

export const LEGAL_VERSIONS = {
  terms: '2026-09-17.v1',
  privacy: '2026-09-17.v1',
  communityGuidelines: '2026-09-11.v1',
  identityVerificationNotice: '2026-09-11.v1',
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
  /** [LEGAL REVIEW REQUIRED] Confirm support inbox. */
  email: 'support@datetoday.app',
  /** [LEGAL REVIEW REQUIRED] Legal entity / mailing address for Terms. */
  legalEntity: '[LEGAL REVIEW REQUIRED — legal entity name]',
  mailingAddress: '[LEGAL REVIEW REQUIRED — mailing address]',
  governingLaw: '[LEGAL REVIEW REQUIRED — governing law / venue]',
} as const;

export const APP_STORE_LINKS = {
  /** Open platform subscription management */
  appleSubscriptions: 'https://apps.apple.com/account/subscriptions',
  googleSubscriptions: 'https://play.google.com/store/account/subscriptions',
} as const;

export const CONSENT_COPY =
  'By continuing, you agree to DateToday’s Terms of Service and acknowledge the Privacy Policy and Community Guidelines. You must be 18 or older.';
