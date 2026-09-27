import * as FileSystem from 'expo-file-system/legacy';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { getFirebaseStorage } from '@/lib/firebase/client';

/** True when the URI is already a hosted http(s) URL. */
export function isRemoteMediaUrl(uri: string | null | undefined): boolean {
  return Boolean(uri && /^https?:\/\//i.test(uri));
}

/**
 * Firestore / discover clients can only render http(s) media.
 * Never persist content://, file://, ph://, etc.
 */
export function remoteMediaUrlOrNull(uri: string | null | undefined): string | null {
  return isRemoteMediaUrl(uri) ? (uri as string) : null;
}

/** Human-readable upload failure that keeps the underlying code for bug reports. */
export function describeUploadError(error: unknown): string {
  const code =
    typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  const serverResponse =
    typeof error === 'object' && error && 'customData' in error
      ? String((error as { customData?: { serverResponse?: unknown } }).customData?.serverResponse ?? '')
      : '';

  let friendly: string;
  switch (code) {
    case 'storage/unauthenticated':
      friendly = 'You are signed out. Sign in again, then retry.';
      break;
    case 'storage/unauthorized':
      friendly = 'Storage refused this file (permission or file type/size).';
      break;
    case 'storage/quota-exceeded':
      friendly = 'Storage quota exceeded on the server.';
      break;
    default:
      friendly = /read (local )?media/i.test(message)
        ? 'Could not read that file from your phone. If it is in iCloud, open it in Photos first.'
        : 'Check your connection and try again.';
  }

  const detail = [code, serverResponse || message].filter(Boolean).join(' — ').slice(0, 300);
  return detail ? `${friendly}\n\n(${detail})` : friendly;
}

function blobFromUri(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      if (xhr.status !== 0 && (xhr.status < 200 || xhr.status >= 300)) {
        reject(new Error(`Failed to read media (HTTP ${xhr.status})`));
        return;
      }
      if (!xhr.response) {
        reject(new Error('Failed to read media (empty response)'));
        return;
      }
      resolve(xhr.response as Blob);
    };
    xhr.onerror = () => reject(new Error('Failed to read local media file'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

/**
 * Upload a local picker URI to Firebase Storage and return the download URL.
 *
 * Android Photo Picker often returns `content://…`. `fetch(content://)` fails on
 * Hermes, so we copy into the app cache first, then read via XHR → blob.
 */
export async function uploadLocalMedia(
  storagePath: string,
  localUri: string,
  contentType: string,
): Promise<string> {
  if (isRemoteMediaUrl(localUri)) return localUri;

  let fileUri = localUri;
  if (!fileUri.startsWith('file://')) {
    const ext = contentType.includes('video')
      ? 'mp4'
      : contentType.includes('png')
        ? 'png'
        : 'jpg';
    const dest = `${FileSystem.cacheDirectory}upload-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;
    if (!FileSystem.cacheDirectory) {
      throw new Error('Device cache is unavailable for media upload.');
    }
    await FileSystem.copyAsync({ from: localUri, to: dest });
    fileUri = dest;
  }

  const objectRef = ref(getFirebaseStorage(), storagePath);
  const blob = await blobFromUri(fileUri);
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        // Resumable = chunked with built-in retries; single-shot uploads time out on weak cell data.
        await uploadBytesResumable(objectRef, blob, { contentType });
        break;
      } catch (error) {
        if (attempt >= MAX_UPLOAD_ATTEMPTS || !isTransientUploadError(error)) throw error;
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  } finally {
    (blob as Blob & { close?: () => void }).close?.();
  }
  return getDownloadURL(objectRef);
}

const MAX_UPLOAD_ATTEMPTS = 3;

function isTransientUploadError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';
  return (
    code === 'storage/retry-limit-exceeded' ||
    code === 'storage/unknown' ||
    code === 'storage/server-file-wrong-size' ||
    code === ''
  );
}
