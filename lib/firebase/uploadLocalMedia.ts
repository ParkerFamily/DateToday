import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { getFirebaseAuth, getFirebaseStorage } from '@/lib/firebase/client';

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
        ? Platform.OS === 'ios'
          ? 'Could not read that file from your phone. If it is in iCloud, open it in Photos first.'
          : 'Could not read that file from your phone. Record or pick it again.'
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
        console.error(`[DateToday] XHR failed with status ${xhr.status} for ${uri.slice(0, 50)}...`);
        reject(new Error(`Failed to read media (HTTP ${xhr.status})`));
        return;
      }
      if (!xhr.response) {
        console.error(`[DateToday] XHR returned empty response for ${uri.slice(0, 50)}...`);
        reject(new Error('Failed to read media (empty response)'));
        return;
      }
      const blob = xhr.response as Blob;
      console.log(`[DateToday] Created blob from ${uri.slice(0, 30)}... (${blob.size} bytes, type: ${blob.type})`);
      resolve(blob);
    };
    
    xhr.onerror = (e) => {
      console.error('[DateToday] XHR onerror for', uri.slice(0, 50), e);
      reject(new Error(`Failed to read local media file: ${uri.slice(0, 100)}`));
    };
    
    xhr.ontimeout = () => {
      console.error('[DateToday] XHR timeout for', uri.slice(0, 50));
      reject(new Error('Timeout reading media file'));
    };
    
    xhr.responseType = 'blob';
    xhr.timeout = 30000; // 30 second timeout for reading file
    xhr.open('GET', uri, true);
    
    try {
      xhr.send(null);
    } catch (error) {
      console.error('[DateToday] XHR send failed:', error);
      reject(new Error(`Failed to initiate file read: ${error instanceof Error ? error.message : 'Unknown'}`));
    }
  });
}

function storageError(code: string, message: string, serverResponse?: string): Error {
  return Object.assign(new Error(message), { code, customData: { serverResponse } });
}

/**
 * Streams the file from disk natively. Reading a whole video into a JS Blob via XHR fails on
 * some Android devices ("Failed to read local media file"), so native never goes through JS memory.
 */
async function uploadFileNative(storagePath: string, fileUri: string, contentType: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists || !info.size) {
    throw new Error('Failed to read local media file (missing or empty)');
  }

  const bucket = getFirebaseStorage().app.options.storageBucket;
  if (!bucket) throw new Error('Firebase Storage bucket is not configured.');
  const user = getFirebaseAuth().currentUser;
  if (!user) throw storageError('storage/unauthenticated', 'Not signed in');

  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    bucket,
  )}/o?uploadType=media&name=${encodeURIComponent(storagePath)}`;

  for (let attempt = 1; ; attempt++) {
    const last = attempt >= MAX_UPLOAD_ATTEMPTS;
    let result: FileSystem.FileSystemUploadResult;
    try {
      result = await FileSystem.uploadAsync(url, fileUri, {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Firebase ${await user.getIdToken()}`,
          'Content-Type': contentType,
        },
      });
    } catch (error) {
      if (last) throw storageError('storage/retry-limit-exceeded', error instanceof Error ? error.message : String(error));
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }

    if (result.status >= 200 && result.status < 300) return;
    const body = result.body?.slice(0, 200);
    if (result.status === 401) throw storageError('storage/unauthenticated', `HTTP 401`, body);
    if (result.status === 403) throw storageError('storage/unauthorized', `HTTP 403`, body);
    const transient = result.status === 408 || result.status === 429 || result.status >= 500;
    if (!transient || last) throw storageError('storage/unknown', `HTTP ${result.status}`, body);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

/**
 * Upload a local picker URI to Firebase Storage and return the download URL.
 *
 * Android Photo Picker often returns `content://…`, which native uploads can't read,
 * so we copy into the app cache first.
 */
export async function uploadLocalMedia(
  storagePath: string,
  localUri: string,
  contentType: string,
): Promise<string> {
  if (isRemoteMediaUrl(localUri)) return localUri;

  console.log(`[DateToday] uploadLocalMedia (${Platform.OS}): ${localUri.slice(0, 100)}... → ${storagePath}`);

  let fileUri = localUri;
  let shouldCleanup = false;

  // Normalize non-file:// URIs (content://, ph://, etc.) to file:// by copying to cache
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
    
    try {
      // Verify source file exists before copying
      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists) {
        throw new Error(`Source file not found: ${localUri.slice(0, 50)}...`);
      }
      
      await FileSystem.copyAsync({ from: localUri, to: dest });
      fileUri = dest;
      shouldCleanup = true;
      
      // Verify copy succeeded
      const destInfo = await FileSystem.getInfoAsync(fileUri);
      if (!destInfo.exists) {
        throw new Error('Failed to copy file to cache for upload.');
      }
      const sizeInfo = 'size' in destInfo ? ` (${destInfo.size} bytes)` : '';
      console.log(`[DateToday] Copied ${localUri.slice(0, 30)}... to cache${sizeInfo}`);
    } catch (error) {
      console.error('[DateToday] File copy failed:', error);
      throw new Error(`Could not prepare file for upload: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  const objectRef = ref(getFirebaseStorage(), storagePath);
  if (Platform.OS !== 'web') {
    try {
      await uploadFileNative(storagePath, fileUri, contentType);
    } finally {
      if (shouldCleanup) await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
    }
    return getDownloadURL(objectRef);
  }

  let blob: Blob;
  try {
    blob = await blobFromUri(fileUri);
  } catch (error) {
    if (shouldCleanup) await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
    throw error;
  }

  try {
    for (let attempt = 1; ; attempt++) {
      try {
        // Resumable = chunked with built-in retries; single-shot uploads time out on weak cell data.
        await uploadBytesResumable(objectRef, blob, { contentType });
        break;
      } catch (error) {
        if (attempt >= MAX_UPLOAD_ATTEMPTS || !isTransientUploadError(error)) throw error;
        console.log(`[DateToday] Upload attempt ${attempt} failed, retrying...`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  } finally {
    (blob as Blob & { close?: () => void }).close?.();
    // Clean up temp file after upload completes or fails
    if (shouldCleanup) {
      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch {}
    }
  }
  
  const downloadUrl = await getDownloadURL(objectRef);
  console.log(`[DateToday] Upload succeeded: ${storagePath}`);
  return downloadUrl;
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
