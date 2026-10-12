# DateToday — Referral, Sharing, Privacy & Travel Implementation Plan

## Overview

Four major features to implement:
1. Referral System with Rewards
2. Social Sharing & Text Invitations  
3. Block Contacts / Privacy & Safety
4. Fix Travel Mode Worldwide Search

## Current Architecture Assessment

### Database (Firestore)
- Users collection: `/users/{uid}`
- Profiles collection: `/profiles/{uid}`
- Existing blocks/reports system
- RLS via Firestore security rules

### Subscriptions
- RevenueCat integration (iOS/Android)
- Web billing via Stripe
- Entitlements system in `/lib/entitlements/`
- Free vs Plus tiers
- Prices: $9.99 weekly, $19.99 monthly

### Deep Linking
- Expo Router with URL schemes
- `datetoday://` scheme configured
- Linking already set up in app.json

### Existing Features to Preserve
- Google Sign-In (fixed profile overwrite)
- Tutorial system (swipe + upcoming tutorials)
- Live sessions
- Matching/messaging
- Travel Mode (needs fixing)

---

## TASK 1: Referral System

### Database Schema

**New Firestore Collections:**

```typescript
// /referralCodes/{uid}
{
  userId: string;
  code: string;  // Unique 8-char code
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// /referrals/{referralId}
{
  referrerId: string;        // Person who invited
  referredUserId: string;    // Person who signed up
  referralCode: string;
  status: 'pending' | 'completed' | 'invalid';
  completedAt: Timestamp | null;
  createdAt: Timestamp;
}

// /referralRewards/{uid}
{
  userId: string;
  totalReferrals: number;
  completedReferrals: number;
  rewards: {
    extraLikes: number;
    revealCredits: number;
    premiumHours: number;
    hasBadge: boolean;
  };
  milestones: {
    1: boolean,   // 5 likes
    3: boolean,   // 1 reveal
    5: boolean,   // 24h premium
    10: boolean   // badge
  };
  updatedAt: Timestamp;
}
```

### Implementation Files

**New Files:**
- `/lib/referrals/codes.ts` - Generate/validate codes
- `/lib/referrals/tracking.ts` - Track referrals
- `/lib/referrals/rewards.ts` - Reward calculations
- `/features/referrals/claimReward.ts` - Claim logic
- `/components/referrals/ReferralCard.tsx` - UI component
- `/app/referrals/index.tsx` - Referral page

**Modified Files:**
- `/app/(tabs)/profile/index.tsx` - Add "Invite Friends" section
- `/lib/entitlements/index.ts` - Add referral bonuses
- `/features/auth/postAuth.ts` - Track referral on signup

### Referral Flow

1. User gets unique code: `DT-ABC123XY`
2. Share link: `https://datetoday.app/ref/ABC123XY` or `datetoday://ref/ABC123XY`
3. New user signs up via link → referral tracked
4. New user completes onboarding → referral status = 'completed'
5. Referrer gets reward at milestones (1, 3, 5, 10 completed referrals)

### Reward Integration

- Extra likes: Add to daily free likes pool
- Reveal credits: Add to "See Who Likes You" reveals
- Premium hours: Temp entitlement (24h timer)
- Badge: Profile badge "Top Inviter" or similar

### Security

- Unique codes only (no duplicates)
- No self-referrals (check user IDs)
- No duplicate claims (one referral per new user)
- Backend validation before rewards
- Firestore security rules

---

## TASK 2: Social Sharing

### Implementation Files

**New Files:**
- `/lib/sharing/generateLink.ts` - Create shareable links
- `/lib/sharing/nativeShare.ts` - Native share integration
- `/components/sharing/ShareSheet.tsx` - Share UI
- `/assets/images/share-card.png` - Branded 9:16 graphic

**Modified Files:**
- `/app/referrals/index.tsx` - Add share buttons

### Share Content

**Text Template:**
```
I'm on DateToday 👀 Who's out tonight?

Real people. Real plans. Right now.

Join me: [link]
```

**Share Methods:**
- Native iOS/Android Share Sheet
- SMS with prefilled message
- Copy link to clipboard
- Instagram story-compatible image

### Deep Link Handling

- Universal links: `https://datetoday.app/ref/CODE`
- App scheme: `datetoday://ref/CODE`
- Fallback to App Store/Play Store if not installed
- Preserve referral code through install

---

## TASK 3: Block Contacts

### Database Schema

```typescript
// /blockedContacts/{uid}/contacts/{hash}
{
  userId: string;
  phoneHash: string;      // SHA-256 hash
  blockedAt: Timestamp;
  source: 'contact' | 'manual';
}

// /phoneVerifications/{uid} (if not exists)
{
  userId: string;
  phoneNumber: string;    // E.164 format
  verifiedAt: Timestamp;
}
```

### Implementation Files

**New Files:**
- `/lib/contacts/permissions.ts` - Request contact access
- `/lib/contacts/normalize.ts` - Phone number normalization
- `/lib/contacts/matching.ts` - Privacy-safe matching
- `/features/privacy/blockContact.ts` - Block logic
- `/app/settings/block-contacts.tsx` - Block contacts page
- `/components/privacy/ContactPicker.tsx` - Contact selector

**Modified Files:**
- `/app/settings/index.tsx` - Add Privacy & Safety section
- `/features/discover/applyFilters.ts` - Filter blocked users
- `/lib/firebase/client.ts` - Add blocked user queries

### Contact Blocking Flow

1. Settings → Privacy & Safety → Block Contacts
2. Request contact permission (iOS/Android)
3. User selects contact OR enters phone manually
4. Normalize phone number (E.164)
5. Hash phone number (SHA-256 + salt)
6. Store hash in Firestore
7. Filter blocked users from discovery

### Privacy Protections

- Only hash phone numbers, never store raw
- Request permission only when needed
- No bulk address book uploads
- No notifications to blocked users
- Secure matching without exposing users

### Discovery Integration

- Filter in backend queries
- Apply to discovery feed
- Prevent matches between blocked users
- Block messaging/pings

---

## TASK 4: Travel Mode Fix

### Current Problems

- Returns irrelevant results (Alabama, NY before Alabama, US)
- Limited to small location list
- No proper state/country/worldwide support
- Poor search ranking

### Solution: Geocoding API

**Options:**
1. **Google Places Autocomplete API** (already have API key?)
2. **Mapbox Geocoding API**
3. **OpenCage Geocoding API**

**Requirements:**
- Worldwide coverage
- City, state, country, region support
- Proper ranking/relevance
- Administrative boundaries data
- Rate limiting/caching

### Implementation Files

**New Files:**
- `/lib/geocoding/places.ts` - Geocoding API wrapper
- `/lib/geocoding/ranking.ts` - Search result ranking
- `/types/geocoding.ts` - Location types

**Modified Files:**
- `/app/travel/index.tsx` - Travel Mode modal
- `/features/travel/trip.ts` - Location data handling
- `/store/travelMode.ts` - Trip storage

### Location Search Flow

1. User types "Alabama"
2. Debounced search (300ms)
3. Call geocoding API
4. Rank results:
   - Exact matches first
   - Admin level (state > city)
   - Population/prominence
   - Geographic proximity
5. Display: "Alabama, United States — State"
6. User selects
7. Store full location data (lat/lng, type, boundaries)

### Discovery Integration

**Current Issue:**
- State selection searches only center point with radius
- Misses profiles across the state

**Fix:**
- Store location type: 'city' | 'state' | 'country' | 'region'
- For cities: Use radius-based search (existing)
- For states: Use bounding box or admin boundary
- For countries: Country-wide search
- Backend query adapts based on location type

### Test Locations

✅ Must work:
- US States: Alabama, Georgia, California, Texas, New York
- US Cities: Atlanta, Houston, Dallas, Chicago, Miami, LA
- International: London, Paris, Toronto, Tokyo, Lagos, Berlin
- Regions: Provinces, counties, regions worldwide

---

## Implementation Order

### Phase 1: Referral System Foundation
1. Create database collections
2. Generate unique referral codes
3. Track referrals on signup
4. Basic rewards calculation
5. Referral page UI

### Phase 2: Social Sharing
1. Generate shareable links
2. Native share integration
3. Share sheet UI
4. Branded share graphics
5. Deep link handling

### Phase 3: Block Contacts
1. Contact permission handling
2. Phone number normalization
3. Privacy-safe hashing
4. Block contacts page
5. Discovery filtering

### Phase 4: Travel Mode Fix
1. Integrate geocoding API
2. Improve search ranking
3. Update Travel Mode UI
4. Fix discovery queries
5. Test worldwide locations

---

## Dependencies & Costs

### Potential New Dependencies
- None required (use existing Expo modules)

### API Costs (if needed)
- **Google Places API**: $17/1000 requests (Autocomplete)
- **Mapbox Geocoding**: Free tier: 100k/month
- **OpenCage**: Free tier: 2,500/day

**Recommendation:** Start with Mapbox free tier or use existing Google API key if available.

---

## Security Considerations

### Referral System
- Prevent fraud (self-referrals, bots)
- Backend validation
- Rate limiting on code generation
- Audit trail

### Contact Blocking
- Hash phone numbers securely
- No raw phone data exposure
- Secure matching algorithm
- Privacy-preserving discovery filtering

### Social Sharing
- No auto-posting
- User-initiated only
- Secure link generation
- Prevent referral spam

---

## Testing Checklist

### Referral System
- [ ] Generate unique codes
- [ ] Track referrals correctly
- [ ] Rewards at milestones (1, 3, 5, 10)
- [ ] No self-referrals
- [ ] No duplicate claims
- [ ] Integrates with free/plus limits
- [ ] Deep links work (iOS/Android/web)

### Social Sharing
- [ ] Native share sheet opens
- [ ] SMS prefill works
- [ ] Copy link works
- [ ] Branded image generates
- [ ] Referral tracking from shares

### Block Contacts
- [ ] Contact permission request
- [ ] Contact picker works
- [ ] Manual phone entry works
- [ ] Blocked users filtered from discovery
- [ ] No notifications to blocked users
- [ ] Can unblock contacts

### Travel Mode
- [ ] Alabama → Alabama, US (not Alabama, NY)
- [ ] Georgia → Shows both state and country
- [ ] Works for all US states
- [ ] Works for international cities
- [ ] State selections cover whole state
- [ ] Search is responsive/fast
- [ ] Results properly labeled

---

## Completion Criteria

✅ **Referral System**
- Users can invite friends
- Unique codes generated
- Rewards tracked and claimable
- Deep linking works

✅ **Social Sharing**
- Native sharing works
- Branded content available
- Referral tracking accurate

✅ **Block Contacts**
- Contact blocking functional
- Privacy-safe implementation
- Discovery filtering works

✅ **Travel Mode**
- Worldwide search works
- Proper result ranking
- State/country/city selections accurate
- Discovery matches location type

---

## Next Steps

1. Review existing architecture ✅
2. Create implementation plan ✅
3. Begin Phase 1: Referral System
4. Test and iterate
5. Move to Phase 2-4 systematically
6. Final integration testing
7. Update PR with all changes

**Estimated Implementation Time:**
- Referral System: 3-4 hours
- Social Sharing: 2-3 hours
- Block Contacts: 3-4 hours
- Travel Mode Fix: 2-3 hours
- **Total: 10-14 hours of focused development**

This is a multi-session task given the scope and complexity.
