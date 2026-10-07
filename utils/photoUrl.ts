/**
 * Firebase Storage download links need the object path encoded ("users%2Fabc%2Fphoto.jpg").
 * Route params can come back decoded, which turns the link into a 400. Re-encode the path.
 */
export function repairStorageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^(https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/)([^?]+)(\?.*)?$/.exec(url);
  if (!m) return url;
  let path = m[2];
  try {
    path = decodeURIComponent(path);
  } catch {
    /* already raw */
  }
  return `${m[1]}${encodeURIComponent(path)}${m[3] ?? ''}`;
}
