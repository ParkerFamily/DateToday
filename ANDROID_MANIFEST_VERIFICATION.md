# Android Manifest Verification

## Last Verified: October 5, 2026

### Status: ✅ COMPLIANT

The Android build configuration correctly blocks broad photo/video permissions as required by Google Play policy.

## Verification Results

Generated AndroidManifest.xml (via `npx expo prebuild --platform android --clean`):

```xml
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" tools:node="remove"/>
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" tools:node="remove"/>
```

### What This Means

- **`tools:node="remove"`**: These permissions are **explicitly removed** from the final APK
- **Reason**: Some dependency manifests may declare these permissions, but our `blockedPermissions` configuration removes them during the manifest merge
- **Result**: The final APK submitted to Google Play will NOT contain these permissions

## Allowed Permissions

The following permissions ARE included in the manifest:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32"/>
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
<uses-permission android:name="android.permission.VIBRATE"/>
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32"/>
```

### Permission Justifications

| Permission | Justification | When Requested |
|------------|---------------|----------------|
| `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | Core feature: Show nearby available users for dating | When user enables location-based matching |
| `CAMERA` | Core feature: Take profile photos and record video prompts | When user taps "Take Photo" or "Record Video" |
| `RECORD_AUDIO` | Core feature: Record audio for video prompts | When user records video |
| `POST_NOTIFICATIONS` | Core feature: Match and message notifications | When user goes live or receives matches |
| `INTERNET` | Required: All app functionality requires network | Always (no prompt) |
| `VIBRATE` | User experience: Haptic feedback | Always (no prompt) |
| `SYSTEM_ALERT_WINDOW` | Dev experience: Development tools overlay | Always (no prompt) |
| `READ_EXTERNAL_STORAGE` (maxSdk 32) | Legacy: Required for Android 12 and below | Not requested on Android 13+ |
| `WRITE_EXTERNAL_STORAGE` (maxSdk 32) | Legacy: Required for Android 12 and below | Not requested on Android 13+ |

## How to Verify

```bash
# Clean prebuild
npx expo prebuild --platform android --clean

# Check for READ_MEDIA permissions
grep -i "READ_MEDIA" android/app/src/main/AndroidManifest.xml

# Expected output:
#   <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" tools:node="remove"/>
#   <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" tools:node="remove"/>

# Clean up
rm -rf android/
```

## Google Play Compliance

This configuration complies with [Google Play's Photo and Video Permissions policy](https://support.google.com/googleplay/android-developer/answer/14115180):

✅ App uses Android system Photo Picker for media selection  
✅ `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` are blocked/removed  
✅ No broad access to photos or videos  
✅ Users grant access only to selected files  

## References

- Configuration: `app.json` → `expo.android.blockedPermissions`
- Implementation: See `ANDROID_PERMISSIONS.md`
- Code: `app/settings/media.tsx`, `app/(onboarding)/photo.tsx` (uses `ImagePicker.launchImageLibraryAsync()` without permission request)
