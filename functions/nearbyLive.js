const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const RADII = new Set([5, 10, 15, 25, 50]);
const MAX_SCAN = 1000;
const millis = value => typeof value === 'string' ? Date.parse(value) : value?.toMillis?.() ?? NaN;
const field = (user, key) => user?.[key] ?? user?.profile?.[key];

function position(data) {
  const { latitude: lat, longitude: lng } = data ?? {};
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { latitude: lat, longitude: lng } : null;
}

function miles(a, b) {
  const rad = n => n * Math.PI / 180;
  const lat = rad(b.latitude - a.latitude);
  const lng = rad(b.longitude - a.longitude);
  const h = Math.sin(lat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(lng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function interested(preference, gender) {
  if (preference === 'everyone') return ['man', 'woman', 'nonbinary'].includes(gender);
  return (preference === 'men' && gender === 'man') || (preference === 'women' && gender === 'woman');
}

function eligible(user, now) {
  if (!user) return false;
  const completion = user.profileCompletion ?? user.profile?.profileCompletion ?? {};
  const consent = user.consent ?? {};
  const privacy = user.privacyControls ?? {};
  const dob = Date.parse(field(user, 'dateOfBirth'));
  return (user.onboardingComplete === true || user.profile?.onboardingComplete === true
    || completion.onboardingComplete === true)
    && Number.isFinite(dob) && new Date(now - dob).getUTCFullYear() - 1970 >= 18
    && (completion.communityStandards === true || Boolean(user.communityStandardsAcceptedAt)
      || Boolean(consent.acceptedAt && consent.communityGuidelinesVersion))
    && privacy.showInDiscovery !== false && privacy.pauseDiscovery !== true;
}

function active(beacon, now) {
  return beacon?.status === 'active' && !beacon.endedAt
    && millis(beacon.expiresAt) > now
    && RADII.has(beacon.radiusMiles) && position(beacon) !== null;
}

async function nearbyLive(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const header = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!header) return res.status(401).json({ error: 'Sign in to browse Live.' });
  try {
    const { uid } = await getAuth().verifyIdToken(header[1], true);
    const db = getFirestore();
    const now = Date.now();
    const [self, user, hidden] = await Promise.all([
      db.collection('liveSessions').doc(uid).get(),
      db.collection('users').doc(uid).get(),
      db.collection('hiddenUsers').doc(uid).get(),
    ]);
    const mine = self.data();
    const viewer = user.data();
    if (!active(mine, now) || !eligible(viewer, now))
      return res.status(403).json({ error: 'An eligible, active Live session is required.' });

    const hiddenIds = new Set(Array.isArray(hidden.data()?.uids) ? hidden.data().uids : []);
    const [outgoing, incoming, sessions] = await Promise.all([
      db.collection('blocks').where('blockerId', '==', uid).get(),
      db.collection('blocks').where('blockedId', '==', uid).get(),
      db.collection('liveSessions').where('status', '==', 'active').limit(MAX_SCAN + 1).get(),
    ]);
    if (sessions.size > MAX_SCAN) return res.status(503).json({ error: 'Live feed is temporarily unavailable.' });
    outgoing.docs.forEach(doc => hiddenIds.add(doc.data().blockedId));
    incoming.docs.forEach(doc => hiddenIds.add(doc.data().blockerId));
    const myGender = field(viewer, 'gender') ?? field(viewer, 'genderId');
    const myPreference = field(viewer, 'interestedIn') ?? viewer.preferences?.interestedIn;
    const possible = sessions.docs.filter(doc => {
      if (doc.id === uid || hiddenIds.has(doc.id) || !active(doc.data(), now)) return false;
      const beacon = doc.data();
      return miles(position(mine), position(beacon)) <= Math.min(mine.radiusMiles, beacon.radiusMiles);
    });
    const users = possible.length
      ? await db.getAll(...possible.map(doc => db.collection('users').doc(doc.id)))
      : [];
    const candidates = possible.flatMap((doc, i) => {
      const other = users[i].data();
      const beacon = doc.data();
      if (!eligible(other, now)) return [];
      const gender = field(other, 'gender') ?? field(other, 'genderId');
      const preference = field(other, 'interestedIn') ?? other.preferences?.interestedIn;
      if (!interested(myPreference, gender) || !interested(preference, myGender)) return [];
      const displayName = field(other, 'displayName');
      const mainPhotoUrl = field(other, 'mainPhotoUrl');
      if (typeof displayName !== 'string' || !displayName.trim()
        || typeof mainPhotoUrl !== 'string' || !mainPhotoUrl.trim()) return [];
      const distance = miles(position(mine), position(beacon));
      const privacy = other.privacyControls ?? {};
      return [{
        uid: doc.id, displayName, mainPhotoUrl,
        age: new Date(now - Date.parse(field(other, 'dateOfBirth'))).getUTCFullYear() - 1970,
        distanceMiles: privacy.hideDistance === true ? null : Math.round(distance * 10) / 10,
        hideDistance: privacy.hideDistance === true,
        showIntentions: privacy.showIntentions !== false,
        neighborhoodLabel: field(other, 'neighborhoodLabel') ?? null,
        bio: field(other, 'bio') ?? null,
        datingIntention: field(other, 'datingIntention') ?? null,
        verificationStatus: field(other, 'verificationStatus') ?? 'unverified',
        aboutVideoUrl: field(other, 'aboutVideoUrl') ?? null,
        tonightVideoUrl: field(other, 'tonightVideoUrl') ?? null,
        aboutPromptId: field(other, 'aboutPromptId') ?? null,
        aboutPromptText: field(other, 'aboutPromptText') ?? null,
        tonightPromptId: field(other, 'tonightPromptId') ?? null,
        tonightPromptText: field(other, 'tonightPromptText') ?? null,
        heightCm: field(other, 'heightCm') ?? null,
        drinking: field(other, 'drinking') ?? null,
        smoking: field(other, 'smoking') ?? null,
        interests: Array.isArray(field(other, 'interests')) ? field(other, 'interests').slice(0, 10) : [],
        kids: field(other, 'kids') ?? null,
        exercise: field(other, 'exercise') ?? null,
        activities: Array.isArray(beacon.activities) ? beacon.activities : [],
        foodCuisines: Array.isArray(beacon.foodCuisines) ? beacon.foodCuisines : [],
        availabilityMode: beacon.availabilityMode === 'later' ? 'later' : 'live',
        availabilityLabel: beacon.availabilityLabel ?? null,
        laterTonightHour: beacon.laterTonightHour ?? null,
        expiresAt: new Date(millis(beacon.expiresAt)).toISOString(),
        isBoosted: beacon.isBoosted === true,
      }];
    });
    res.set('Cache-Control', 'private, no-store');
    return res.json({ candidates });
  } catch (error) {
    if (error.code?.startsWith('auth/')) return res.status(401).json({ error: 'Sign in again to browse Live.' });
    console.error('nearbyLive failed', error);
    return res.status(503).json({ error: 'Live feed is temporarily unavailable.' });
  }
}

module.exports = { nearbyLive };