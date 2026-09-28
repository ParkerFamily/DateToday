# iPad Layout and Data Persistence Fixes

## Issues Addressed

### 1. iPad Layout Not Responsive
**Problem:** App used phone-only sizing (430px max width) on iPad, making poor use of the larger screen and appearing cramped.

**Solution:** 
- Increased content max width to 600px for tablets while keeping 430px for phones
- Added Platform.isPad detection in Screen component
- Updated useContentLayout hook to dynamically calculate appropriate widths
- Profile screen and all screens using Screen component now properly adapt to tablet sizes

### 2. Account Data Not Persisting on iPad
**Problem:** When user logged into existing account on iPad, profile showed as "not setup", verification status was wrong, and profile picture was missing despite data existing in database.

**Root Causes Identified:**
a) Firestore cache staleness on new devices
b) Race conditions in auth state change handlers
c) Insufficient error handling and logging

**Solutions Implemented:**

#### Cache Staleness Fix
- Added `getDocFromServer()` fallback when cached document not found
- Ensures fresh data is fetched from server when logging in on new devices
- Added source tracking (cache vs server) in logs to diagnose data issues

#### Auth State Handling Improvements
- Enhanced auth state change detection to prevent unnecessary re-hydrations
- Added profileHydration state checking to avoid race conditions
- Improved logic to preserve loaded profile during token refreshes
- Added guard against hydrating profile that's already loading

#### Comprehensive Logging
Added console logging throughout:
- Profile loading from Firestore (with cache/server source)
- Auth state changes and transitions
- Profile hydration state changes
- User session management
- Document fetch success/failure

## Files Modified

1. **utils/responsive.ts** (new)
   - Tablet detection utilities
   - Responsive width calculations

2. **lib/layout.ts**
   - Added TABLET_MAX_WIDTH constant (600px)
   - Updated useContentLayout to detect tablets and use appropriate width

3. **components/ui/Screen.tsx**
   - Added Platform.isPad detection
   - Added columnTablet style with 600px max width
   - Imports TABLET_MAX_WIDTH from layout

4. **app/(tabs)/profile/index.tsx**
   - Imports useContentLayout hook
   - Applies responsive width constraints on ScrollView content
   - Added debug logging for profile state

5. **app/_layout.tsx**
   - Enhanced hydrateSignedInUser with detailed logging
   - Improved auth state change handler with:
     - Bootstrap state checking
     - Profile hydration state validation
     - Same-user detection to prevent re-hydration
     - Loading state detection to prevent duplicate hydrations
   - Added comprehensive debug logs

6. **features/profile/saveOnboarding.ts**
   - Imported getDocFromServer for fallback
   - Added server fallback when cached document not found
   - Added source tracking in logs (cache vs server)
   - Improved error handling and logging

## Testing Recommendations

1. **iPad Layout Testing:**
   - Verify all screens properly use 600px max width on iPad
   - Check that content is centered and readable
   - Ensure no UI elements overflow or clip

2. **Data Persistence Testing:**
   - Log out and log back in on iPad
   - Verify profile data loads correctly
   - Check console logs for "Loaded user document from server" message
   - Confirm profile picture, verification status, and other data display correctly

3. **Multi-Device Testing:**
   - Log in on phone, then log in on iPad with same account
   - Verify data syncs correctly
   - Check that both devices show same profile information

## Debug Information

When investigating issues, check console logs for these key messages:

```
[DateToday] Loading profile for user: <uid>
[DateToday] Loaded user document from cache/server: {...}
[DateToday] Auth state changed: {...}
[DateToday] Profile hydration state: ...
[DateToday] ProfileTabScreen - Profile state: {...}
```

## Backwards Compatibility

All changes are backwards compatible:
- Phone layouts unchanged (still use 430px max width)
- Existing auth flows preserved
- Cache-first strategy maintained with server fallback
- No breaking changes to components or APIs
