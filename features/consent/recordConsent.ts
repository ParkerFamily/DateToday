import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseAuth, getDb } from '@/lib/firebase/client';
import { assertFirebaseConfigured, isBackendConfigured } from '@/lib/env';
import { LEGAL_VERSIONS } from '@/constants/legal';
import { analytics } from '@/lib/analytics';

export type ConsentRecord = {
  termsVersion: string;
  privacyVersion: string;
  communityGuidelinesVersion: string;
  acceptedAt: string;
  method: 'welcome_continue' | 'signup' | 'reconsent' | 'onboarding_agreements';
};

/**
 * Record affirmative consent after user continues past linked Terms/Privacy/Guidelines.
 * Does not use a pre-checked box — call only after the user takes a continue action.
 */
export async function recordLegalConsent(
  method: ConsentRecord['method'] = 'welcome_continue',
): Promise<ConsentRecord> {
  const record: ConsentRecord = {
    termsVersion: LEGAL_VERSIONS.terms,
    privacyVersion: LEGAL_VERSIONS.privacy,
    communityGuidelinesVersion: LEGAL_VERSIONS.communityGuidelines,
    acceptedAt: new Date().toISOString(),
    method,
  };

  analytics.track('legal_consent_accepted', {
    termsVersion: record.termsVersion,
    privacyVersion: record.privacyVersion,
  });

  if (!isBackendConfigured()) return record;

  assertFirebaseConfigured();
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid) return record;

  await setDoc(
    doc(getDb(), 'users', uid),
    {
      consent: record,
      termsVersion: record.termsVersion,
      privacyVersion: record.privacyVersion,
      communityGuidelinesVersion: record.communityGuidelinesVersion,
      communityStandardsAcceptedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return record;
}
