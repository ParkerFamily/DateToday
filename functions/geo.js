const { geohashForLocation } = require('geofire-common');

/** Must match `geohashOf` in features/live/firestoreLive.ts — the feed range-queries this field. */
function geohashOf(latitude, longitude) {
  return geohashForLocation([latitude, longitude], 9);
}

/** The geohash a liveSessions / nearbyProfiles doc should carry, or null if it has no usable point. */
function expectedGeohash(data) {
  const lat = data && data.latitude;
  const lng = data && data.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return geohashOf(lat, lng);
}

/** Older app versions write a location without a geohash; fill it in so they still show up nearby. */
async function syncGeohash(snap) {
  const data = snap && snap.exists ? snap.data() : null;
  const hash = expectedGeohash(data);
  if (!hash || data.geohash === hash) return false;
  await snap.ref.update({ geohash: hash }).catch(() => undefined);
  return true;
}

module.exports = { geohashOf, expectedGeohash, syncGeohash };
