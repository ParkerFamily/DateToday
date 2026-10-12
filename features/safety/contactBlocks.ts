import * as Crypto from 'expo-crypto';
import { requireOptionalNativeModule } from 'expo';
import { Linking, Platform } from 'react-native';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { functionsUrl } from '@/features/matches/api';
import { contactKey, maskContact, typedContactKey } from '@/lib/contactKey';

export type ContactBlockEntry = { id: string; label: string };
export type ContactBlockSummary = { entries: ContactBlockEntry[]; phoneLast4: string | null; max: number };
export type DeviceContact = { id: string; name: string; phones: string[]; emails: string[] };

async function post<T>(action: string, body: object = {}): Promise<T> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const res = await fetch(functionsUrl('contactBlocks'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) {
    throw Object.assign(new Error(json.error || 'Something went wrong. Try again.'), { code: json.code ?? null });
  }
  return json;
}

const sha256 = (key: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key);

async function hashKeys(keys: (string | null)[]) {
  const unique = [...new Set(keys.filter((k): k is string => Boolean(k)))];
  return Promise.all(unique.map(sha256));
}

export const contactBlockSummary = () => post<ContactBlockSummary>('list');

export const removeContactBlocks = (ids: string[]) => post<{ removed: number }>('remove', { ids });

/** Your number lets people who blocked it in their contacts stay hidden from you, and you from them. */
export const setMyContactPhone = (phone: string | null) => post<{ phoneLast4: string | null }>('setPhone', { phone });

export async function blockTypedContact(raw: string) {
  const key = typedContactKey(raw);
  if (!key) throw new Error('Enter a full phone number or email.');
  return post<{ added: number }>('add', { entries: [{ label: maskContact(raw), hashes: await hashKeys([key]) }] });
}

/** Only hashes leave the phone; the label is the name as saved in the user's own contacts. */
export async function blockDeviceContacts(contacts: DeviceContact[]) {
  const entries = (
    await Promise.all(
      contacts.map(async (c) => ({
        label: c.name,
        hashes: await hashKeys([
          ...c.phones.map((p) => contactKey('phone', p)),
          ...c.emails.map((e) => contactKey('email', e)),
        ]),
      })),
    )
  ).filter((e) => e.hashes.length > 0);
  let added = 0;
  for (let i = 0; i < entries.length; i += 200) {
    added += (await post<{ added: number }>('add', { entries: entries.slice(i, i + 200) })).added;
  }
  return { added, skipped: contacts.length - entries.length };
}

/** The contacts module ships with the next app build; until then the screens fall back to typing. */
export function deviceContactsSupported() {
  return Platform.OS !== 'web' && Boolean(requireOptionalNativeModule('ExpoContactsNext'));
}

export async function loadDeviceContacts(): Promise<DeviceContact[] | 'denied'> {
  const Contacts = require('expo-contacts') as typeof import('expo-contacts');
  const permission = await Contacts.requestPermissionsAsync();
  if (!permission.granted) return 'denied';
  const rows = await Contacts.Contact.getAllDetails(
    [Contacts.ContactField.FULL_NAME, Contacts.ContactField.PHONES, Contacts.ContactField.EMAILS] as const,
    { sortOrder: Contacts.ContactsSortOrder.UserDefault },
  );
  return rows
    .map((r) => {
      const phones = (r.phones ?? []).map((p) => p.number ?? '').filter((n) => contactKey('phone', n));
      const emails = (r.emails ?? []).map((e) => e.address ?? '').filter((a) => contactKey('email', a));
      const name = (r.fullName ?? '').trim() || phones[0] || emails[0] || '';
      return { id: r.id, name, phones, emails };
    })
    .filter((c) => c.name && (c.phones.length || c.emails.length));
}

/** Opens Messages with the invite filled in; with no numbers, the user picks recipients there. */
export async function textInvite(message: string, numbers: string[] = []) {
  const body = encodeURIComponent(message);
  const to = numbers.map((n) => n.replace(/[^\d+]/g, '')).filter(Boolean);
  let url: string;
  if (Platform.OS === 'ios') {
    url = to.length > 1 ? `sms:/open?addresses=${to.join(',')}&body=${body}` : `sms:${to[0] ?? ''}&body=${body}`;
  } else {
    url = `sms:${to.join(',')}?body=${body}`;
  }
  await Linking.openURL(url);
}
