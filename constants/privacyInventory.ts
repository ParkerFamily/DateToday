/**
 * Privacy / data inventory grounded in what DateToday actually collects today.
 * Used by in-app Privacy Policy screens. Do not invent collection practices.
 */

export type DataNecessity = 'required' | 'optional' | 'conditional' | 'required_for_live' | 'required_for_discovery';

export type DataCategory = {
  id: string;
  title: string;
  items: {
    name: string;
    what: string;
    why: string;
    whereStored: string;
    sharedWith: string;
    retention: string;
    deletion: string;
    necessity: DataNecessity;
  }[];
};

export const DATA_INVENTORY: DataCategory[] = [
  {
    id: 'identifiers',
    title: 'Identifiers',
    items: [
      {
        name: 'Name (display / legal name)',
        what: 'Name you enter; may be prefilled from Google/Apple.',
        why: 'Show your profile and match government ID during verification.',
        whereStored: 'Firebase Auth profile fields; Firestore users/{uid} and profiles/{uid}.',
        sharedWith: 'Other users (display name on profile); Google/Apple during sign-in; Persona if you verify.',
        retention: '[LEGAL REVIEW REQUIRED] While account is active; removed or anonymized on deletion except limited safety/legal holds.',
        deletion: 'Account deletion removes profile name; Auth account deleted.',
        necessity: 'required',
      },
      {
        name: 'Email',
        what: 'Email from signup or Google/Apple.',
        why: 'Account recovery, security, transactional notices.',
        whereStored: 'Firebase Auth; Firestore users/{uid}; may be copied to deleted_users for audit.',
        sharedWith: 'Firebase/Google Cloud; Apple/Google for auth; not shown publicly on profiles.',
        retention: '[LEGAL REVIEW REQUIRED]',
        deletion: 'Removed from Auth/Firestore on account deletion; limited audit copy may remain.',
        necessity: 'required',
      },
      {
        name: 'Phone number',
        what: 'Not collected in the current app build.',
        why: 'N/A',
        whereStored: 'N/A',
        sharedWith: 'N/A',
        retention: 'N/A',
        deletion: 'N/A',
        necessity: 'optional',
      },
      {
        name: 'Firebase UID',
        what: 'Unique account id assigned by Firebase Auth.',
        why: 'Secure ownership of your data and auth sessions.',
        whereStored: 'Firebase Auth; all user-owned Firestore/Storage paths.',
        sharedWith: 'Firebase/Google Cloud; Persona as reference id when verifying.',
        retention: 'While account exists.',
        deletion: 'Auth user deleted; documents removed.',
        necessity: 'required',
      },
      {
        name: 'Device identifiers / push token',
        what: 'Expo push token when notifications are enabled (when implemented end-to-end).',
        why: 'Deliver pings, matches, messages, and plan alerts.',
        whereStored: 'Intended: private user or push_tokens collection. Not fully wired on Firebase today.',
        sharedWith: 'Apple/Google push infrastructure; Expo notification service when used.',
        retention: '[LEGAL REVIEW REQUIRED]',
        deletion: 'Removed with account when tokens are stored.',
        necessity: 'optional',
      },
    ],
  },
  {
    id: 'profile',
    title: 'Profile data',
    items: [
      {
        name: 'Date of birth / age',
        what: 'DOB you confirm (YYYY-MM-DD). Age is derived; DOB is private.',
        why: 'Enforce 18+ eligibility; age filters.',
        whereStored: 'Firestore users/{uid} (private). Not intended for public profiles.',
        sharedWith: 'Persona if you start verification (birthdate may be prefilled).',
        retention: '[LEGAL REVIEW REQUIRED]',
        deletion: 'Deleted with users/{uid} on account deletion.',
        necessity: 'required',
      },
      {
        name: 'Gender, preferences, dating intentions/vibes, bio',
        what: 'Self-described profile and discovery preferences.',
        why: 'Matching and showing who you are open to.',
        whereStored: 'Firestore users/{uid}; subset mirrored to profiles/{uid} for discovery.',
        sharedWith: 'Other signed-in users via public profile fields.',
        retention: 'While account active.',
        deletion: 'Deleted with account.',
        necessity: 'required',
      },
      {
        name: 'Photos and videos',
        what: 'Main photo and prompt videos (About You / Tonight).',
        why: 'Core product experience — people see who is available tonight.',
        whereStored: 'Firebase Storage users/{uid}/…; download URLs on users/profiles docs.',
        sharedWith: 'Other signed-in users who can view profiles/discovery (Storage currently readable by any signed-in user — hardening in progress).',
        retention: 'While account active.',
        deletion: 'Storage objects deleted during account deletion.',
        necessity: 'required_for_live',
      },
    ],
  },
  {
    id: 'location',
    title: 'Location',
    items: [
      {
        name: 'Device location (when permitted)',
        what: 'Foreground lat/lng from the OS while using Go Live / activation.',
        why: 'Show people available near you and compute distance.',
        whereStored: 'Not written to Firestore today. When live backend is active, coordinates are intended for private live-session records only — not public profiles.',
        sharedWith: 'Not shared as raw coordinates with other users. Others should only see approximate distance (e.g. “3 miles away”).',
        retention: 'Live session lifetime / [LEGAL REVIEW REQUIRED].',
        deletion: 'Ends with live session / account deletion.',
        necessity: 'required_for_discovery',
      },
      {
        name: 'Radius / neighborhood label',
        what: 'Your chosen search radius and optional neighborhood label.',
        why: 'Control how far you appear and how location is described.',
        whereStored: 'users/{uid}; may appear on profiles as non-precise labels.',
        sharedWith: 'Other users see distance approximations, not exact coords.',
        retention: 'While account active.',
        deletion: 'With account.',
        necessity: 'required',
      },
    ],
  },
  {
    id: 'communication',
    title: 'Communication & safety',
    items: [
      {
        name: 'Messages, pings, matches, date plans',
        what: 'Interaction content when those features are backend-enabled.',
        why: 'Core messaging and planning product.',
        whereStored: 'Intended private collections (schema exists in legacy SQL; Firebase collections rolling out).',
        sharedWith: 'Participants in the conversation/match only.',
        retention: '[LEGAL REVIEW REQUIRED]',
        deletion: 'Removed or anonymized on account deletion where technically supported.',
        necessity: 'conditional',
      },
      {
        name: 'Reports and blocks',
        what: 'Report reason/details; block relationships.',
        why: 'Safety, moderation, and keeping blocked users out of your experience.',
        whereStored: 'Firestore reports/ and blocks/ (Firebase).',
        sharedWith: 'Moderation staff/systems only for reports. Blocked users are not notified of the block reason.',
        retention: '[LEGAL REVIEW REQUIRED] Safety records may be retained longer.',
        deletion: 'Your blocks deleted with account; reports you filed may be retained for safety/legal.',
        necessity: 'optional',
      },
    ],
  },
  {
    id: 'verification',
    title: 'Identity / age verification (Persona)',
    items: [
      {
        name: 'Verification status & inquiry id',
        what: 'personaInquiryId, verificationStatus, verified timestamps when confirmed.',
        why: 'Show VERIFIED / NOT VERIFIED; reduce fake accounts; confirm 18+.',
        whereStored: 'Firestore users/{uid} (private). Status may be mirrored carefully to public profiles after trusted confirmation.',
        sharedWith: 'Persona processes ID/selfie. DateToday should store minimum metadata — not raw government ID images in Firebase.',
        retention: '[LEGAL REVIEW REQUIRED — align with Persona retention settings]',
        deletion: 'Inquiry references removed with account; Persona may retain per their policy.',
        necessity: 'optional',
      },
      {
        name: 'Government ID, selfie, biometric signals',
        what: 'Processed by Persona during verification — not intended to be stored in DateToday Firebase Storage.',
        why: 'Identity/age checks.',
        whereStored: 'Persona systems.',
        sharedWith: 'Persona (processor). See Persona Privacy Policy.',
        retention: 'Controlled in Persona dashboard — use shortest practical retention.',
        deletion: 'Request via Persona / DateToday support per policy.',
        necessity: 'optional',
      },
    ],
  },
  {
    id: 'purchases',
    title: 'Purchases',
    items: [
      {
        name: 'Subscription / boost status',
        what: 'DateToday+ and Tonight Boost purchase state when payments are live.',
        why: 'Unlock premium features and boosts.',
        whereStored: 'Intended server-validated entitlements (not client-only flags). Stripe webhook stubs exist; App Store/Play IAP not fully wired.',
        sharedWith: 'Apple/Google/Stripe as payment processors.',
        retention: '[LEGAL REVIEW REQUIRED] Transaction records often retained for tax/chargebacks.',
        deletion: 'Account deletion does not cancel store subscriptions automatically.',
        necessity: 'optional',
      },
    ],
  },
  {
    id: 'technical',
    title: 'Device / technical',
    items: [
      {
        name: 'App diagnostics',
        what: 'Basic analytics events currently logged locally in development (console). No third-party analytics SDK shipped in package.json today.',
        why: 'Debug product flows.',
        whereStored: 'Device logs / developer tooling.',
        sharedWith: 'None beyond development tooling unless a crash/analytics SDK is added later.',
        retention: 'N/A / ephemeral',
        deletion: 'N/A',
        necessity: 'optional',
      },
      {
        name: 'IP address',
        what: 'May be processed by Firebase/Google Cloud, Apple, Google, Persona as part of normal network requests — not separately stored by the DateToday app code.',
        why: 'Security, abuse prevention, service delivery.',
        whereStored: 'Service provider logs.',
        sharedWith: 'Infrastructure providers.',
        retention: 'Per provider policies.',
        deletion: 'Per provider policies.',
        necessity: 'conditional',
      },
    ],
  },
];

export const THIRD_PARTY_SERVICES = [
  {
    name: 'Firebase / Google Cloud',
    purpose: 'Authentication, Firestore database, Cloud Storage, and related infrastructure.',
    data: 'Account, profile, media, and app data you create.',
    policy: 'https://firebase.google.com/support/privacy',
  },
  {
    name: 'Apple',
    purpose: 'Sign in with Apple; App Store subscriptions (when enabled); push delivery on iOS.',
    data: 'Apple identity token / email relay; purchase receipts.',
    policy: 'https://www.apple.com/legal/privacy/',
  },
  {
    name: 'Google',
    purpose: 'Google Sign-In; Google Play billing (when enabled); Firebase services.',
    data: 'Google account profile basics used for sign-in.',
    policy: 'https://policies.google.com/privacy',
  },
  {
    name: 'Persona',
    purpose: 'Optional identity and age verification (ID + selfie).',
    data: 'Government ID images, selfie/video, DOB, verification outcomes — processed by Persona.',
    policy: 'https://withpersona.com/legal/privacy-policy',
  },
  {
    name: 'Expo / push infrastructure',
    purpose: 'App runtime; notifications when configured.',
    data: 'Push tokens and device permission state.',
    policy: 'https://expo.dev/privacy',
  },
  {
    name: 'Stripe (planned / stub)',
    purpose: 'Card payments for subscriptions/boosts if/when Stripe checkout is enabled.',
    data: 'Customer and transaction metadata — card data handled by Stripe, not stored in DateToday Firestore.',
    policy: 'https://stripe.com/privacy',
  },
] as const;
