import { collection, doc, onSnapshot, query, where, type Timestamp } from 'firebase/firestore';
import { signInWithCustomToken } from 'firebase/auth';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';
import { securityPost, useDeviceSecurity } from '@/features/security/session';

export type DeviceLocation = { city: string; region: string; country: string; countryCode: string };

export type SignedInDevice = {
  id: string;
  platform: 'ios' | 'android' | 'web';
  deviceLabel: string;
  location: DeviceLocation | null;
  signedInAt: number;
  lastActiveAt: number;
  needsCode: boolean;
  current: boolean;
};

const ms = (value: unknown) => (value && typeof (value as Timestamp).toMillis === 'function' ? (value as Timestamp).toMillis() : 0);

/** "Dallas, TX" in the US/Canada, "London, United Kingdom" elsewhere. */
export function placeLabel(location: DeviceLocation | null | undefined): string {
  if (!location) return '';
  const { city, region, country, countryCode } = location;
  if (!city) return country || '';
  if ((countryCode === 'US' || countryCode === 'CA') && region) return `${city}, ${region}`;
  return [city, country].filter(Boolean).join(', ');
}

/** Devices currently signed in to `uid`: this one first, then most recently active. */
export function subscribeDevices(uid: string, onChange: (devices: SignedInDevice[]) => void, onError?: () => void) {
  return onSnapshot(
    query(collection(getDb(), 'sessions'), where('uid', '==', uid)),
    (snap) => {
      const currentId = useDeviceSecurity.getState().sessionId;
      const devices = snap.docs
        .filter((d) => !d.get('revokedAt'))
        .map((d) => {
          const data = d.data();
          const location = data.location && typeof data.location === 'object' ? (data.location as DeviceLocation) : null;
          return {
            id: d.id,
            platform: data.platform === 'ios' || data.platform === 'android' ? data.platform : 'web',
            deviceLabel: typeof data.deviceLabel === 'string' && data.deviceLabel ? data.deviceLabel : 'Unknown device',
            location,
            signedInAt: ms(data.createdAt),
            lastActiveAt: ms(data.lastActiveAt) || ms(data.createdAt),
            needsCode: data.needsCode === true,
            current: d.id === currentId,
          } satisfies SignedInDevice;
        });
      devices.sort((a, b) => Number(b.current) - Number(a.current) || b.lastActiveAt - a.lastActiveAt);
      onChange(devices);
    },
    () => onError?.(),
  );
}

export async function signOutDevice(sessionId: string) {
  await securityPost({ action: 'signOutDevice', sessionId });
}

/** Signs out every other device for real (their sign-in stops working) and keeps this one signed in. */
export async function signOutOtherDevices(): Promise<number> {
  const sessionId = useDeviceSecurity.getState().sessionId;
  const result = await securityPost<{ signedOut: number; token: string | null }>({ action: 'signOutOthers', sessionId });
  if (result.token) await signInWithCustomToken(getFirebaseAuth(), result.token);
  return result.signedOut;
}

export function subscribeTwoStep(uid: string, onChange: (enabled: boolean) => void) {
  return onSnapshot(
    doc(getDb(), 'securitySettings', uid),
    (snap) => onChange(snap.exists() && snap.get('twoStepEmail') === true),
    () => undefined,
  );
}

/** Emails a code that confirms turning two-step verification on or off. Returns the masked address. */
export async function sendTwoStepCode(enabled: boolean): Promise<string> {
  const { email } = await securityPost<{ email: string }>({ action: 'sendTwoStepCode', enabled });
  return email;
}

export async function setTwoStep(enabled: boolean, code: string) {
  await securityPost({
    action: 'setTwoStep',
    enabled,
    code: code.replace(/\s/g, ''),
    sessionId: useDeviceSecurity.getState().sessionId,
  });
}
