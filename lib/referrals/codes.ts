import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  serverTimestamp, 
  setDoc, 
  where 
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';

/**
 * Generate a unique referral code: DT-XXXXXXXX
 * Format: 8 uppercase alphanumeric characters (excluding ambiguous: 0, O, I, 1, l)
 */
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0, O, I, 1
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Get or create a referral code for a user
 */
export async function getReferralCode(userId: string): Promise<string> {
  const codeRef = doc(getDb(), 'referralCodes', userId);
  const codeSnap = await getDoc(codeRef);

  if (codeSnap.exists()) {
    return codeSnap.data().code;
  }

  // Generate a new unique code
  let code = generateCode();
  let attempts = 0;
  const maxAttempts = 10;

  // Ensure code is unique
  while (attempts < maxAttempts) {
    const existingQuery = query(
      collection(getDb(), 'referralCodes'),
      where('code', '==', code)
    );
    const existing = await getDocs(existingQuery);

    if (existing.empty) {
      break; // Code is unique
    }

    code = generateCode();
    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique referral code');
  }

  // Save the code
  await setDoc(codeRef, {
    userId,
    code,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return code;
}

/**
 * Validate a referral code and return the referrer's user ID
 */
export async function validateReferralCode(code: string): Promise<string | null> {
  const codesQuery = query(
    collection(getDb(), 'referralCodes'),
    where('code', '==', code.toUpperCase())
  );
  const codesSnap = await getDocs(codesQuery);

  if (codesSnap.empty) {
    return null;
  }

  const codeDoc = codesSnap.docs[0];
  return codeDoc.data().userId as string;
}

/**
 * Generate a shareable referral link
 */
export function generateReferralLink(code: string): {
  universalLink: string;
  appSchemeLink: string;
} {
  return {
    universalLink: `https://datetoday.app/ref/${code}`,
    appSchemeLink: `datetoday://ref/${code}`,
  };
}

/**
 * Parse a referral code from a URL or deep link
 */
export function parseReferralCode(url: string): string | null {
  // Handle universal links: https://datetoday.app/ref/CODE
  if (url.includes('datetoday.app/ref/')) {
    const match = url.match(/\/ref\/([A-Z0-9]{8})/);
    return match ? match[1] : null;
  }

  // Handle app scheme: datetoday://ref/CODE
  if (url.startsWith('datetoday://ref/')) {
    const match = url.match(/datetoday:\/\/ref\/([A-Z0-9]{8})/);
    return match ? match[1] : null;
  }

  return null;
}
