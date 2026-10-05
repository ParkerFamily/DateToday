const RADII = new Set([5, 10, 15, 25, 50]);
const MAX_SCAN = 1000;
const MAX_SESSION_MS = 3 * 60 * 60 * 1000;
const REACTIVATION_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const ACTIVATION_ISSUER = 'activateLive-v1';

function timestamp(value) {
  if (typeof value === 'string') return Date.parse(value);
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  return NaN;
}

function position(data) {
  const latitude = data?.latitude;
  const longitude = data?.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number'
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function distanceMiles(a, b) {
  const radians = value => value * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function interested(preference, gender) {
  if (preference === 'everyone') return ['man', 'woman', 'nonbinary'].includes(gender);
  if (preference === 'men') return gender === 'man';
  if (preference === 'women') return gender === 'woman';
  return false;
}

function publicValue(data, key) {
  return data?.[key] ?? data?.profile?.[key];
}

function eligible(data, now = Date.now()) {
  const completion = data?.profileCompletion ?? data?.profile?.profileCompletion ?? {};
  const consent = data?.consent ?? {};
  const privacy = data?.privacyControls ?? {};
  const dob = Date.parse(publicValue(data, 'dateOfBirth'));
  const age = Number.isFinite(dob) ? new Date(now - dob).getUTCFullYear() - 1970 : 0;
  return (data?.onboardingComplete === true || data?.profile?.onboardingComplete === true || completion.onboardingComplete === true)
    && age >= 18
    && (completion.communityStandards === true || Boolean(data?.communityStandardsAcceptedAt)
      || Boolean(consent.acceptedAt && consent.communityGuidelinesVersion))
    && privacy.showInDiscovery !== false && privacy.pauseDiscovery !== true;
}

function canBrowseProfiles(user, decodedToken) {
  return user?.phoneVerificationRequired !== true
    || (typeof decodedToken?.phone_number === 'string' && decodedToken.phone_number.length > 0);
}

function validActivation(data, now) {
  const startedAt = timestamp(data?.startedAt);
  const expiresAt = timestamp(data?.expiresAt);
  return data?.issuer === ACTIVATION_ISSUER
    && data.status === 'active' && !data.endedAt
    && Number.isFinite(startedAt) && startedAt <= now
    && expiresAt > now && expiresAt <= startedAt + MAX_SESSION_MS
    && RADII.has(data.radiusMiles) && position(data) !== null;
}

function validActivationInput(body, now) {
  const coordinates = position(body);
  const expiresAt = timestamp(body?.expiresAt);
  if (!coordinates) return { error: 'Valid latitude and longitude are required.' };
  if (!RADII.has(body?.radiusMiles)) return { error: 'Choose a supported Live radius.' };
  if (!Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + MAX_SESSION_MS)
    return { error: 'Live expiry must be in the next three hours.' };
  const activities = Array.isArray(body?.activities)
    ? body.activities.filter(value => typeof value === 'string').slice(0, 8)
    : [];
  const foodCuisines = Array.isArray(body?.foodCuisines)
    ? body.foodCuisines.filter(value => typeof value === 'string').slice(0, 8)
    : [];
  return {
    coordinates: {
      latitude: Math.round(coordinates.latitude * 100) / 100,
      longitude: Math.round(coordinates.longitude * 100) / 100,
    },
    radiusMiles: body.radiusMiles,
    expiresAt,
    activities,
    foodCuisines,
  };
}

async function authenticate(req, auth) {
  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!bearer) return null;
  return auth.verifyIdToken(bearer[1], true);
}

function sendAuthFailure(error, res) {
  if (error.code?.startsWith('auth/')) return res.status(401).json({ error: 'Sign in again to use Live.' });
  return null;
}

async function activateLive(req, res, dependencies = {}) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = dependencies.auth ?? require('firebase-admin/auth').getAuth();
  const db = dependencies.db ?? require('firebase-admin/firestore').getFirestore();
  const now = dependencies.now ?? Date.now();
  let decoded;
  try {
    decoded = await authenticate(req, auth);
  } catch (error) {
    if (sendAuthFailure(error, res)) return;
    console.error('activateLive authentication failed', error);
    return res.status(503).json({ error: 'Live activation is temporarily unavailable.' });
  }
  if (!decoded) return res.status(401).json({ error: 'Sign in to go Live.' });

  const activation = validActivationInput(req.body ?? {}, now);
  if (activation.error) return res.status(400).json({ error: activation.error });
  try {
    const userRef = db.collection('users').doc(decoded.uid);
    const activationRef = db.collection('liveActivations').doc(decoded.uid);
    const sessionRef = db.collection('liveSessions').doc(decoded.uid);
    const result = await db.runTransaction(async transaction => {
      const userSnapshot = await transaction.get(userRef);
      const user = userSnapshot.data();
      if (!eligible(user, now) || !canBrowseProfiles(user, decoded)) return { forbidden: true };
      const previousSnapshot = await transaction.get(activationRef);
      const previous = previousSnapshot.data();
      const lastActivation = timestamp(previous?.startedAt);
      if (Number.isFinite(lastActivation) && now < lastActivation + REACTIVATION_COOLDOWN_MS)
        return { retryAt: lastActivation + REACTIVATION_COOLDOWN_MS };

      const startedAt = new Date(now);
      const expiresAt = new Date(activation.expiresAt);
      const laterTonightHour = Number.isInteger(req.body.laterTonightHour)
        && req.body.laterTonightHour >= 18 && req.body.laterTonightHour <= 21
        ? req.body.laterTonightHour : null;
      const sessionData = {
        userId: decoded.uid,
        status: 'active',
        startedAt,
        expiresAt,
        endedAt: null,
        radiusMiles: activation.radiusMiles,
        latitude: activation.coordinates.latitude,
        longitude: activation.coordinates.longitude,
        activities: activation.activities,
        foodCuisines: activation.foodCuisines,
        laterTonightHour,
        availabilityMode: laterTonightHour !== null ? 'later' : 'live',
        availabilityLabel: typeof req.body.availabilityLabel === 'string'
          ? req.body.availabilityLabel.slice(0, 80) : null,
        updatedAt: startedAt,
      };
      transaction.set(activationRef, { ...sessionData, issuer: ACTIVATION_ISSUER });
      transaction.set(sessionRef, sessionData);
      return { startedAt: new Date(now).toISOString(), expiresAt: new Date(activation.expiresAt).toISOString() };
    });
    if (result.forbidden) return res.status(403).json({ error: 'Complete your profile and verify your phone to go Live.' });
    if (result.retryAt) return res.status(429).json({
      error: 'Live location can only be changed once every three hours.',
      retryAt: new Date(result.retryAt).toISOString(),
    });
    res.set('Cache-Control', 'private, no-store');
    return res.status(201).json({ session: result });
  } catch (error) {
    console.error('activateLive failed', error);
    return res.status(503).json({ error: 'Live activation is temporarily unavailable.' });
  }
}

async function nearbyLive(req, res, dependencies = {}) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = dependencies.auth ?? require('firebase-admin/auth').getAuth();
  const db = dependencies.db ?? require('firebase-admin/firestore').getFirestore();
  const now = dependencies.now ?? Date.now();
  let decoded;
  try {
    decoded = await authenticate(req, auth);
  } catch (error) {
    if (sendAuthFailure(error, res)) return;
    console.error('nearbyLive authentication failed', error);
    return res.status(503).json({ error: 'Live feed is temporarily unavailable.' });
  }
  if (!decoded) return res.status(401).json({ error: 'Sign in to browse Live.' });
  try {
    const activationRef = db.collection('liveActivations');
    const sessionRef = db.collection('liveSessions');
    const [ownActivation, ownSession, ownUser, hidden] = await Promise.all([
      activationRef.doc(decoded.uid).get(),
      sessionRef.doc(decoded.uid).get(),
      db.collection('users').doc(decoded.uid).get(),
      db.collection('hiddenUsers').doc(decoded.uid).get(),
    ]);
    const mine = ownActivation.data();
    const mySession = ownSession.data();
    const myProfile = ownUser.data();
    if (!validActivation(mine, now) || mySession?.status !== 'active' || mySession?.endedAt
      || !eligible(myProfile, now) || !canBrowseProfiles(myProfile, decoded))
      return res.status(403).json({ error: 'An eligible, phone-verified active Live session is required.' });

    const hiddenIds = new Set(Array.isArray(hidden.data()?.uids) ? hidden.data().uids : []);
    const [outgoing, incoming, activations] = await Promise.all([
      db.collection('blocks').where('blockerId', '==', decoded.uid).get(),
      db.collection('blocks').where('blockedId', '==', decoded.uid).get(),
      activationRef.where('expiresAt', '>', new Date(now)).limit(MAX_SCAN + 1).get(),
    ]);
    if (activations.size > MAX_SCAN) return res.status(503).json({ error: 'Live feed is temporarily unavailable.' });
    outgoing.docs.forEach(doc => hiddenIds.add(doc.data().blockedId));
    incoming.docs.forEach(doc => hiddenIds.add(doc.data().blockerId));
    const myGender = publicValue(myProfile, 'gender') ?? publicValue(myProfile, 'genderId');
    const myInterest = publicValue(myProfile, 'interestedIn') ?? myProfile.preferences?.interestedIn;
    const possible = activations.docs.filter(doc => {
      if (doc.id === decoded.uid || hiddenIds.has(doc.id) || !validActivation(doc.data(), now)) return false;
      return distanceMiles(position(mine), position(doc.data()))
        <= Math.min(mine.radiusMiles, doc.data().radiusMiles);
    });
    const [users, sessions] = possible.length
      ? await Promise.all([
        db.getAll(...possible.map(doc => db.collection('users').doc(doc.id))),
        db.getAll(...possible.map(doc => sessionRef.doc(doc.id))),
      ])
      : [[], []];
    const candidates = possible.flatMap((doc, i) => {
      const profile = users[i].data();
      const session = sessions[i].data();
      const activation = doc.data();
      if (session?.status !== 'active' || session?.endedAt || !eligible(profile, now)) return [];
      const gender = publicValue(profile, 'gender') ?? publicValue(profile, 'genderId');
      const interest = publicValue(profile, 'interestedIn') ?? profile.preferences?.interestedIn;
      if (!interested(myInterest, gender) || !interested(interest, myGender)) return [];
      const distance = distanceMiles(position(mine), position(activation));
      const displayName = publicValue(profile, 'displayName');
      const mainPhotoUrl = publicValue(profile, 'mainPhotoUrl');
      if (typeof displayName !== 'string' || !displayName.trim()
        || typeof mainPhotoUrl !== 'string' || !mainPhotoUrl.trim()) return [];
      const dob = Date.parse(publicValue(profile, 'dateOfBirth'));
      const age = new Date(now - dob).getUTCFullYear() - 1970;
      const privacy = profile.privacyControls ?? {};
      return [{
        uid: doc.id, displayName, age, mainPhotoUrl,
        bio: publicValue(profile, 'bio') ?? null,
        neighborhoodLabel: publicValue(profile, 'neighborhoodLabel') ?? null,
        distanceMiles: privacy.hideDistance === true ? null : Math.round(distance * 10) / 10,
        hideDistance: privacy.hideDistance === true,
        showIntentions: privacy.showIntentions !== false,
        activities: Array.isArray(session.activities) ? session.activities : [],
        foodCuisines: Array.isArray(session.foodCuisines) ? session.foodCuisines : [],
        availabilityMode: session.availabilityMode === 'later' ? 'later' : 'live',
        availabilityLabel: session.availabilityLabel ?? null,
        laterTonightHour: session.laterTonightHour ?? null,
        expiresAt: new Date(timestamp(activation.expiresAt)).toISOString(),
        aboutVideoUrl: publicValue(profile, 'aboutVideoUrl') ?? null,
        tonightVideoUrl: publicValue(profile, 'tonightVideoUrl') ?? null,
        aboutPromptId: publicValue(profile, 'aboutPromptId') ?? null,
        aboutPromptText: publicValue(profile, 'aboutPromptText') ?? null,
        tonightPromptId: publicValue(profile, 'tonightPromptId') ?? null,
        tonightPromptText: publicValue(profile, 'tonightPromptText') ?? null,
        datingIntention: publicValue(profile, 'datingIntention') ?? null,
        verificationStatus: publicValue(profile, 'verificationStatus') ?? 'unverified',
        heightCm: publicValue(profile, 'heightCm') ?? null,
        drinking: publicValue(profile, 'drinking') ?? null,
        smoking: publicValue(profile, 'smoking') ?? null,
        interests: Array.isArray(publicValue(profile, 'interests')) ? publicValue(profile, 'interests').slice(0, 10) : [],
        kids: publicValue(profile, 'kids') ?? null,
        exercise: publicValue(profile, 'exercise') ?? null,
        isBoosted: session.isBoosted === true,
      }];
    });
    res.set('Cache-Control', 'private, no-store');
    return res.json({ candidates });
  } catch (error) {
    console.error('nearbyLive failed', error);
    return res.status(503).json({ error: 'Live feed is temporarily unavailable.' });
  }
}

module.exports = {
  activateLive,
  nearbyLive,
  canBrowseProfiles,
  eligible,
  validActivation,
  validActivationInput,
  MAX_SESSION_MS,
  REACTIVATION_COOLDOWN_MS,
};