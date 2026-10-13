# Race & Ethnicity Implementation Summary

## Overview

Complete implementation of race and ethnicity identification and dating preference system for DateToday. This feature gives users control over how they identify and who they prefer to date, while maintaining a healthy discovery experience and creating a meaningful premium filtering benefit.

## ✅ Completed Features

### 1. Database Schema
- **Profile** interface:
  - `ethnicities?: string[] | null` - User's self-identified race/ethnicity (multi-select)
  - `showEthnicity?: boolean` - Profile visibility toggle (default: false)
- **DatingPreferences** interface:
  - `preferredEthnicities?: string[]` - Dating preferences (multi-select)
  - `strictEthnicityFilter?: boolean` - Plus-only strict filtering
- **DiscoveryCard** interface:
  - `ethnicities?: string[] | null` - Visible when user opts in
- **EntitlementKey** type:
  - `strict_ethnicity_filter` - Premium entitlement

### 2. Constants & Options
**File:** `constants/ethnicity.ts`
- 12 ethnicity options:
  - Black / African American
  - White
  - Hispanic / Latino
  - East Asian
  - South Asian
  - Southeast Asian
  - Middle Eastern / North African
  - Native American / Alaska Native
  - Native Hawaiian / Pacific Islander
  - Multiracial / Mixed
  - Other
  - Prefer not to say
- Helper functions: `ethnicityLabel()`, `ethnicityLabels()`

### 3. Onboarding Flow
**File:** `app/(onboarding)/ethnicity.tsx`
- Optional screen after interests, before distance
- Multi-select ethnicity picker
- "Show my race or ethnicity on my profile" toggle (default: OFF)
- "Skip this question" button
- Beautiful UI matching DateToday branding
- **Integration:** Updated `app/(onboarding)/interests.tsx` to route to ethnicity screen

### 4. Profile Editing
**File:** `app/settings/edit-profile.tsx`
- Added "Race & Ethnicity" row in Background section
- Multi-select ethnicity editing sheet
- Visibility toggle within the editing sheet
- Shows current status: "Visible on profile" or "Hidden on profile"
- Multi-line preview of selected ethnicities
- Persists to Firebase users, profiles, and liveProfileFields

### 5. Dating Preferences
**File:** `app/settings/ethnicity-preferences.tsx`
- New screen: "Ethnicity preferences"
- Two modes:
  - "I'm open to everyone" (default)
  - "I have preferences" (multi-select)
- Strict filtering toggle (Plus-only):
  - Free users see upgrade paywall
  - Clear explanation of strict filtering behavior
- Privacy note explaining self-reported nature
- **Integration:** Added link from `app/settings/preferences.tsx`

### 6. Discovery Algorithm
**File:** `features/discover/applyFilters.ts`
- **Free users:**
  - Selected ethnicities are prioritized (NOT excluded)
  - Users without disclosed ethnicity still appear
- **Plus users with strict filter:**
  - Only shows profiles matching selected ethnicities
  - Users without disclosed ethnicity are hidden in strict mode
- **Never infers ethnicity** from photos, names, or other data
- Respects all existing filters (age, gender, distance, etc.)

### 7. Discovery Ranking
**File:** `components/discover/DiscoverFeed.tsx`
- Ethnicity match bonus: +8 points per matching ethnicity
- Similar weight to interest matches
- Integrated into existing compatibility score calculation
- Only applies when user has ethnicity preferences selected
- Only boosts cards that have disclosed their ethnicity

### 8. Filter Labels
**File:** `features/discover/applyFilters.ts`
- **Active filter chips:**
  - Free: "Prefer: [ethnicities]"
  - Plus with strict: "Only: [ethnicities]"
- **Matched filter labels on cards:**
  - Shows matching ethnicities when they match preferences
  - Example: "Black / African American", "South Asian"

### 9. State Management
**File:** `store/onboardingDraft.ts`
- Added `ethnicities: string[]`
- Added `showEthnicity: boolean`
- Added `preferredEthnicities: string[]`
- Setters: `setEthnicities()`, `setShowEthnicity()`, `setPreferredEthnicities()`
- Persisted to AsyncStorage

**File:** `store/discoverFilters.ts`
- Added `ethnicityPreference: string[]`
- Added `strictEthnicityFilter: boolean`
- Setter: `setStrictEthnicityFilter()`
- Added to `DEFAULT_FILTERS`

### 10. Entitlements
**File:** `lib/entitlements/index.ts`
- Added `strict_ethnicity_filter` to `PLUS_ENTITLEMENTS`
- New function: `canUseStrictEthnicityFilter(state)`
- Integrated with existing subscription system

### 11. Privacy & User Control
- ✅ All questions optional
- ✅ Multi-select supported
- ✅ Users can skip
- ✅ Profile visibility defaults to OFF
- ✅ Users can edit/remove information anytime
- ✅ Preferences are private (never shown publicly)
- ✅ Never infers ethnicity from data
- ✅ Clear explanations of how data affects discovery
- ✅ Strict filtering is premium-only (prevents misuse)

## 📊 How It Works

### Free Users
1. **Identify:** Can select their own race/ethnicity (optional)
2. **Visibility:** Can toggle whether it shows on profile (default: hidden)
3. **Preferences:** Can select ethnicities they prefer
4. **Discovery:** Matching profiles are **prioritized** (+8 boost per match)
5. **Behavior:** Other ethnicities still appear, just ranked lower
6. **Cannot:** Activate strict filtering

### Paid Users (DateToday+)
1. **All free features** +
2. **Strict filter:** Can enable "Only show selected ethnicities"
3. **Behavior:** 
   - Only shows profiles matching selected ethnicities
   - Users without disclosed ethnicity are hidden
4. **Toggle:** Can turn strict filtering on/off anytime

### Discovery Algorithm Flow
```
1. Apply all existing filters (age, gender, distance, etc.)
2. If strict ethnicity filter active (Plus only):
   - Exclude cards without disclosed ethnicity
   - Exclude cards without any matching ethnicity
3. Calculate ranking scores:
   - Compatibility score (activities, food)
   - Interest matches (+4 per shared interest)
   - Ethnicity matches (+8 per matching ethnicity) ← NEW
4. Sort by:
   - Priority Likes
   - Regular Likes
   - Live tier (live now > later > nearby)
   - Combined compatibility + interest + ethnicity score
```

## 🔧 Technical Implementation

### Files Created
- `constants/ethnicity.ts` - Options and helpers
- `app/(onboarding)/ethnicity.tsx` - Onboarding screen
- `app/settings/ethnicity-preferences.tsx` - Preferences screen

### Files Modified
- `types/index.ts` - Database schema
- `store/onboardingDraft.ts` - Onboarding state
- `store/discoverFilters.ts` - Filter state
- `lib/entitlements/index.ts` - Premium entitlement
- `features/discover/applyFilters.ts` - Filtering logic + labels
- `components/discover/DiscoverFeed.tsx` - Ranking boost
- `app/(onboarding)/interests.tsx` - Routing
- `app/settings/edit-profile.tsx` - Profile editing
- `app/settings/preferences.tsx` - Preferences link

### Database Fields Required

#### Firestore `users/{uid}` collection:
```typescript
{
  ethnicities?: string[] | null,
  showEthnicity?: boolean,
  preferredEthnicities?: string[],
  strictEthnicityFilter?: boolean,
  // ... existing fields
}
```

#### Firestore `profiles/{uid}` collection:
```typescript
{
  ethnicities?: string[] | null,
  showEthnicity?: boolean,
  // ... existing fields
}
```

#### Live profile fields (for discovery cards):
```typescript
{
  ethnicities?: string[] | null,
  // ... existing fields
}
```

## ⚠️ Remaining Backend Work

### 1. Firestore Security Rules
Add to `firestore.rules`:
```javascript
// Allow users to read/write their own ethnicity data
match /users/{userId} {
  allow read, write: if request.auth.uid == userId;
  
  // Ethnicity fields are sensitive - never expose in public queries
  // Only showEthnicity=true profiles expose ethnicities in discovery
}

match /profiles/{userId} {
  allow read: if request.auth != null;
  // Only include ethnicities field if showEthnicity == true
}
```

### 2. Discovery Query Updates
Update Cloud Functions that build discovery cards:
```typescript
// Only include ethnicities when showEthnicity is true
if (user.showEthnicity && user.ethnicities?.length) {
  discoveryCard.ethnicities = user.ethnicities;
}
```

### 3. Migration (If Needed)
If you have existing users, no migration needed - new fields are optional.

### 4. Indexes
May need Firestore composite indexes if querying by ethnicity + other fields.

## 🧪 Testing Checklist

- [ ] **Onboarding:**
  - [ ] Can select multiple ethnicities
  - [ ] Can skip ethnicity question
  - [ ] Visibility toggle works
  - [ ] Progresses to next screen correctly
  
- [ ] **Profile Editing:**
  - [ ] Can add ethnicities
  - [ ] Can remove ethnicities
  - [ ] Visibility toggle works
  - [ ] Changes persist after logout/login
  - [ ] Multi-select works correctly
  
- [ ] **Preferences:**
  - [ ] "Open to everyone" mode works
  - [ ] Can select multiple preferred ethnicities
  - [ ] Preferences save correctly
  - [ ] Link from Dating Preferences works
  
- [ ] **Free Users:**
  - [ ] Can set ethnicity identity
  - [ ] Can set ethnicity preferences
  - [ ] Cannot activate strict filter
  - [ ] See upgrade paywall when attempting strict filter
  - [ ] Discovery prioritizes matching ethnicities
  - [ ] Still see other ethnicities
  
- [ ] **Paid Users:**
  - [ ] Can activate strict ethnicity filter
  - [ ] Strict filter only shows matches
  - [ ] Can toggle strict filter on/off
  - [ ] Filter status persists
  
- [ ] **Discovery:**
  - [ ] Ethnicity matches boost ranking
  - [ ] Active filter chips show ethnicity
  - [ ] Matched filter labels show on cards
  - [ ] Users without ethnicity handled correctly
  - [ ] Strict filter excludes undisclosed ethnicities
  - [ ] Free users see prioritization, not exclusion
  
- [ ] **Privacy:**
  - [ ] Ethnicity hidden by default
  - [ ] Visibility toggle works
  - [ ] Preferences are private
  - [ ] No ethnicity inference from photos
  - [ ] Users can delete their data
  
- [ ] **Subscription:**
  - [ ] Subscription restore updates strict filter access
  - [ ] Free → Plus unlocks strict filter
  - [ ] Plus → Free disables strict filter
  
- [ ] **Existing Functionality:**
  - [ ] All other filters still work
  - [ ] Matching logic unchanged
  - [ ] Likes/messages unaffected
  - [ ] Profile completion unaffected
  - [ ] No performance regression

## 📝 Privacy Policy Updates Needed

Before release, update your privacy policy to include:

1. **Data Collection:**
   - "Race and ethnicity information (optional, self-reported)"
   
2. **How It's Used:**
   - "To personalize your discovery experience"
   - "To show you profiles matching your preferences"
   - "Never inferred from photos or other data"
   
3. **Who Sees It:**
   - "Only visible on your profile when you opt in"
   - "Your preferences are private"
   
4. **User Control:**
   - "You can edit or delete this information anytime"
   - "You can hide your ethnicity from your profile"
   
5. **Not Used For:**
   - "Advertising targeting"
   - "Marketing purposes"
   - "Automatic categorization"

## 🎯 Design Decisions

### Why Optional?
- Respect user privacy
- Recognize that not everyone identifies with provided categories
- Acknowledge complexity of race/ethnicity concepts

### Why Multi-Select?
- Many people have multiracial identities
- Hispanic/Latino overlaps with racial categories
- More accurate representation

### Why Default Hidden?
- Privacy-first approach
- Users opt in rather than opt out
- Prevents accidental disclosure

### Why Strict Filter is Premium?
- Creates meaningful paid benefit
- Prevents misuse of exclusionary filtering
- Keeps basic functionality accessible

### Why Prioritize Not Exclude (Free)?
- Maintains discovery quality
- Prevents filter bubbles
- Better user experience

## 🚀 Future Enhancements (Optional)

1. **Analytics** (privacy-compliant):
   - Track adoption rate of feature
   - Monitor strict filter usage
   - Measure impact on match rates

2. **A/B Testing:**
   - Test different ranking boost amounts
   - Test impact of default visibility setting

3. **Admin Tools:**
   - Add ethnicity options via admin console
   - Monitor for misuse/abuse

4. **More Options:**
   - Allow custom text entry for "Other"
   - Additional subcategories

5. **Matching Algorithm:**
   - ML-based compatibility that includes ethnicity matches
   - Smarter prioritization over time

## 📞 Support

If users ask about ethnicity:
- "Ethnicity information is optional and self-reported"
- "We never infer ethnicity from your photos or other data"
- "You can edit or remove this information anytime in Settings"
- "Strict filtering is a DateToday+ feature"

## ✨ Success Metrics

Track these to measure success:
- % users who add ethnicity information
- % users who set ethnicity preferences
- % Plus users who enable strict filtering
- Match rate impact (before/after)
- User satisfaction surveys
- Support tickets related to ethnicity

## 🎉 Conclusion

This implementation provides comprehensive race and ethnicity features while prioritizing:
- **User Control:** Optional, editable, deletable
- **Privacy:** Hidden by default, never inferred
- **Inclusivity:** Multi-select, comprehensive options
- **Premium Value:** Strict filtering as paid benefit
- **Healthy Discovery:** Prioritize, don't exclude (free tier)

The system is production-ready pending:
1. Firestore security rules
2. Backend discovery query updates
3. Privacy policy updates
4. Testing completion

Pull Request: https://github.com/ParkerFamily/DateToday/pull/17
