/**
 * Policy / consent versioning for DateToday.
 * Bump versions when material legal text changes; require re-consent when needed.
 *
 * Placeholders marked [LEGAL REVIEW REQUIRED] must be confirmed by counsel / owner.
 */

export const LEGAL_VERSIONS = {
  terms: '2026-09-11.v1',
  privacy: '2026-09-11.v1',
  communityGuidelines: '2026-09-11.v1',
  identityVerificationNotice: '2026-09-11.v1',
} as const;

export type LegalDocKey = keyof typeof LEGAL_VERSIONS;

/** Public URLs once hosted — used for App Store / Play and in-app WebBrowser. */
export const LEGAL_URLS = {
  /** [LEGAL REVIEW REQUIRED] Replace with production HTTPS URLs. */
  privacyPolicy: 'https://datetoday.app/legal/privacy',
  termsOfService: 'https://datetoday.app/legal/terms',
  communityGuidelines: 'https://datetoday.app/legal/community',
  accountDeletion: 'https://datetoday.app/delete-account',
  support: 'https://datetoday.app/support',
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
