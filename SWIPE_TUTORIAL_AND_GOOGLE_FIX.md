# Swipe Tutorial + Google Sign-In Profile Overwrite Fix

## Summary

This document describes the implementation of two critical improvements to the DateToday application:

1. **Interactive Animated Swipe Tutorial** - Helps first-time users understand the swipe interface
2. **Google Sign-In Profile Overwrite Fix** - Prevents Google account information from overwriting existing DateToday profiles

---

## TASK 1: Interactive Animated Swipe Tutorial

### Implementation

#### Files Created

1. **`/workspace/lib/tutorial.ts`**
   - Manages tutorial completion state using AsyncStorage
   - Functions: `hasCompletedSwipeTutorial()`, `markSwipeTutorialCompleted()`, `resetSwipeTutorial()`
   - Persists per-device, survives app restarts

2. **`/workspace/components/discover/SwipeTutorial.tsx`**
   - Full-screen modal overlay with dimmed background
   - Three-step tutorial flow:
     - Step 1: Swipe right to like (animated hand + glowing heart)
     - Step 2: Swipe left to skip (animated hand + X icon)
     - Step 3: Match explanation (two hearts together)
   - Animated using `react-native-reanimated` for smooth, performant animations
   - Respects `AccessibilityInfo.isReduceMotionEnabled()` for reduced motion users
   - Styled with DateToday's dark purple theme and violet accents

#### Files Modified

**`/workspace/components/discover/DiscoverFeed.tsx`**
- Added tutorial state management
- Shows tutorial automatically when first card loads (if not previously completed)
- Added help button (?) in header to replay tutorial anytime
- Tutorial never interferes with real swipe gestures or profile data

### Features

✅ **Automatic display** on first visit to discovery screen  
✅ **Animated demonstrations** of swipe right/left gestures  
✅ **Match explanation** with visual feedback  
✅ **Skip and Got It buttons** for user control  
✅ **Help button** to replay tutorial anytime  
✅ **Reduced motion support** for accessibility  
✅ **Per-device persistence** using AsyncStorage  
✅ **Dark purple theme** matching DateToday's brand  
✅ **No interference** with real likes, matches, or profile data  

### Tutorial Flow

```
User opens discovery screen
    ↓
Check: Has user completed tutorial?
    ↓ No
Show tutorial overlay
    ↓
Step 1: Demonstrate swipe right → like
    ↓
Step 2: Demonstrate swipe left → skip
    ↓
Step 3: Explain matches
    ↓
User clicks "Got It" or "Skip"
    ↓
Mark tutorial as completed
    ↓
Store completion in AsyncStorage
    ↓
Hide tutorial, show normal feed
```

---

## TASK 2: Google Sign-In Profile Overwrite Fix

### Root Cause

In `/workspace/features/auth/social.ts`, the `ensureUserDoc()` function was unconditionally updating `displayName` and `photoURL` from Google/Apple account data **every time the user signed in**, even for existing users with completed DateToday profiles.

#### Before (Problematic Code)

```typescript
const payload: Record<string, unknown> = {
  email: email ?? null,
  authProvider: provider ?? null,
  provider: provider ?? null,
  providerIds,
  lastSignInAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};
if (displayName) payload.displayName = displayName;  // ❌ ALWAYS overwrites
if (extras?.photoURL) payload.photoURL = extras.photoURL;  // ❌ ALWAYS overwrites
if (extras?.isNewUser) {
  payload.createdAt = serverTimestamp();
  payload.verificationStatus = 'unverified';
}
await setDoc(doc(getDb(), 'users', uid), payload, { merge: true });
```

#### After (Fixed Code)

```typescript
const payload: Record<string, unknown> = {
  email: email ?? null,
  authProvider: provider ?? null,
  provider: provider ?? null,
  providerIds,
  lastSignInAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
};
// Only prefill displayName and photoURL for NEW users. Existing users keep their DateToday profile data.
if (extras?.isNewUser) {
  payload.createdAt = serverTimestamp();
  payload.verificationStatus = 'unverified';
  if (displayName) payload.displayName = displayName;  // ✅ NEW users only
  if (extras.photoURL) payload.photoURL = extras.photoURL;  // ✅ NEW users only
}
await setDoc(doc(getDb(), 'users', uid), payload, { merge: true });
```

### What Was Fixed

The fix ensures that `displayName` and `photoURL` from Google/Apple are ONLY used when:
- `extras?.isNewUser === true` (brand new account creation)

For existing users signing in again:
- ✅ Authentication proceeds normally
- ✅ All DateToday profile data is preserved
- ✅ `lastSignInAt` and `providerIds` are still updated (auth metadata only)
- ✅ No profile fields are overwritten

### Behavior Before Fix

1. User creates DateToday account with Google
2. User customizes their name to "Alex" and uploads their own profile photo
3. User logs out
4. User changes their Google name to "Alexander Johnson"
5. User signs back into DateToday with Google
6. **BUG**: DateToday profile name changes to "Alexander Johnson", photo may change too ❌

### Behavior After Fix

1. User creates DateToday account with Google → Google info used to prefill initial profile ✅
2. User customizes their name to "Alex" and uploads their own profile photo ✅
3. User logs out ✅
4. User changes their Google name to "Alexander Johnson"
5. User signs back into DateToday with Google ✅
6. **FIXED**: DateToday profile name stays "Alex", photo unchanged ✅

### Protected Fields

After the fix, these fields are ONLY set during initial account creation, never on subsequent logins:
- `displayName`
- `photoURL`

These fields continue to update on every sign-in (authentication metadata):
- `email`
- `authProvider`
- `provider`
- `providerIds`
- `lastSignInAt`
- `updatedAt`

For new users only:
- `createdAt`
- `verificationStatus`

### Database Protection

The fix is implemented at the correct layer:
- ✅ Fixed in the authentication service (`features/auth/social.ts`)
- ✅ Uses conditional logic based on `isNewUser` flag from Firebase
- ✅ Still uses `{ merge: true }` for safe updates
- ✅ No blind upserts that could overwrite data

---

## Testing Requirements

### Swipe Tutorial Testing

1. **First-Time User**
   - [ ] Fresh install/cleared storage → tutorial shows automatically
   - [ ] Can swipe right animation visible
   - [ ] Can swipe left animation visible
   - [ ] Match explanation displays
   - [ ] "Got It" button completes tutorial
   - [ ] Tutorial doesn't show again after completion

2. **Skip Button**
   - [ ] "Skip" button dismisses tutorial
   - [ ] Tutorial marked as completed even when skipped
   - [ ] Skipped tutorial doesn't show again

3. **Help Button**
   - [ ] Help (?) button visible in discovery header
   - [ ] Clicking help button replays tutorial
   - [ ] Tutorial can be completed/skipped from replay

4. **Accessibility**
   - [ ] Reduced motion settings respected
   - [ ] Accessibility labels present
   - [ ] VoiceOver/TalkBack compatible

5. **No Interference**
   - [ ] Tutorial swipes don't create actual likes
   - [ ] Tutorial swipes don't create actual skips
   - [ ] Tutorial swipes don't write to database
   - [ ] Tutorial doesn't block real swipe gestures after dismissal

### Google Sign-In Fix Testing

1. **New User Registration**
   - [ ] Sign up with Google for the first time
   - [ ] Google name prefills the initial profile
   - [ ] Google photo (if available) prefills initial profile
   - [ ] Complete onboarding successfully

2. **Existing User Login Preservation**
   - [ ] Sign in as existing Google user
   - [ ] Edit DateToday name to something different
   - [ ] Edit DateToday profile photo
   - [ ] Log out completely
   - [ ] Sign back in with Google
   - [ ] ✅ DateToday name unchanged (not overwritten by Google)
   - [ ] ✅ DateToday photo unchanged

3. **Google Account Changes**
   - [ ] Change Google account name in Google settings
   - [ ] Sign in to DateToday
   - [ ] ✅ DateToday profile name stays the same
   - [ ] Change Google profile picture
   - [ ] Sign in to DateToday
   - [ ] ✅ DateToday profile picture stays the same

4. **Repeated Sign-Ins**
   - [ ] Sign in multiple times in a row
   - [ ] ✅ No profile fields change
   - [ ] Sign in after app restart
   - [ ] ✅ No profile fields change

5. **Other Data Preservation**
   - [ ] Existing user retains all likes
   - [ ] Existing user retains all matches
   - [ ] Existing user retains all messages
   - [ ] Existing user retains preferences
   - [ ] Existing user retains subscription status
   - [ ] Existing user retains onboarding completion

6. **Edit Profile Still Works**
   - [ ] User can edit their name through Edit Profile screen
   - [ ] Changes save successfully
   - [ ] Changes persist after Google sign-in
   - [ ] Changes persist after app restart

7. **Authentication Still Works**
   - [ ] Google authentication completes successfully
   - [ ] User can access their account
   - [ ] Session persists correctly
   - [ ] Token refresh doesn't overwrite profile

8. **Apple Sign-In (Same Fix)**
   - [ ] Same behavior for Apple Sign-In users
   - [ ] Apple profile data only used for new accounts

---

## Files Changed

### Created
- `/workspace/lib/tutorial.ts`
- `/workspace/components/discover/SwipeTutorial.tsx`

### Modified
- `/workspace/features/auth/social.ts`
- `/workspace/components/discover/DiscoverFeed.tsx`

---

## Technical Details

### Tutorial State Management
- **Storage**: AsyncStorage (device-local)
- **Key**: `datetoday.swipeTutorial.completed`
- **Type**: Boolean string (`'true'` when completed)
- **Persistence**: Survives app restarts, cleared on uninstall

### Animation Implementation
- **Library**: `react-native-reanimated` (existing dependency)
- **Performance**: Runs on UI thread for smooth 60fps
- **Accessibility**: Checks `AccessibilityInfo.isReduceMotionEnabled()`
- **Duration**: ~1.6s per swipe animation cycle (repeating)

### Google Sign-In Fix
- **Location**: `ensureUserDoc()` function in `/workspace/features/auth/social.ts`
- **Approach**: Conditional field setting based on `isNewUser` flag
- **Safety**: Uses Firestore `merge: true` to preserve other fields
- **Scope**: Affects both Google and Apple sign-in flows

---

## Safeguards

### Tutorial Safeguards
1. Tutorial swipes never call `sendInterest()` or similar APIs
2. Tutorial never modifies `handled` or `passed` state in DiscoverFeed
3. Tutorial never writes to Firestore or Supabase
4. Tutorial animations cancel properly on dismissal
5. Tutorial state is per-device (not per-account) for simplicity

### Google Fix Safeguards
1. Only blocks automatic overwrites, not legitimate user edits
2. Preserves all authentication metadata updates
3. Still allows admin/backend profile updates
4. Doesn't affect email/password authentication
5. Doesn't break existing linked authentication methods

---

## Known Limitations

### Tutorial
- Tutorial completion is per-device, not per-account
  - Same user on a new device will see tutorial again
  - This is acceptable as tutorials are typically device-onboarding
- Tutorial cannot be shown mid-swipe (only on card load)

### Google Fix
- Does not recover data already lost to overwrites
  - Previous overwritten data is not automatically restored
  - Users would need to re-edit their profiles if needed
- Historical audit trail of overwrites not implemented
  - Future enhancement: could log profile changes

---

## Conclusion

Both improvements are now implemented and ready for testing:

1. ✅ **Swipe Tutorial** educates new users without interfering with the app
2. ✅ **Google Sign-In Fix** prevents profile data loss on subsequent logins

The changes are minimal, focused, and preserve all existing functionality while adding the requested features.
