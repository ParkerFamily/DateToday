# Android Permissions Strategy

## Photo and Video Access

DateToday uses the **Android system Photo Picker** for media selection, which does NOT require broad photo/video library permissions.

### Compliance with Google Play Policy

Google Play's Photo and Video Permissions policy (enforced as of early 2025) states that apps with "one-time or infrequent use of photos" must:
1. Use the system photo picker
2. Remove `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` from the manifest

DateToday's use cases (profile photos, profile videos, posts) are classified as "one-time or infrequent use" and therefore MUST use the system picker.

### Implementation

#### Blocked Permissions

The following permissions are explicitly blocked in `app.json`:

```json
"android": {
  "blockedPermissions": [
    "android.permission.READ_MEDIA_IMAGES",
    "android.permission.READ_MEDIA_VIDEO"
  ]
}
```

These permissions are blocked to prevent any plugin from adding them to the final manifest.

#### How Media Selection Works

1. **No Permission Request**: The app never calls `requestMediaLibraryPermissionsAsync()`
2. **Direct Picker Launch**: Code calls `ImagePicker.launchImageLibraryAsync()` directly
3. **System Picker**: Android displays the native Photo Picker
4. **Scoped Access**: The app receives a `content://` URI with access only to the selected file
5. **Upload**: The selected file is uploaded to Firebase Storage

#### Expo SDK 57+ Changes

expo-image-picker v57.0.0+ (June 2026) removed `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` from its Android manifest as a breaking change. This aligns with Google Play policy and enables the system Photo Picker by default.

### Other Permissions

#### Camera (CAMERA)
- **Purpose**: Take new photos/videos with the camera
- **Request**: Only when user chooses "Take Photo" or "Record Video"
- **Location**: Requested via `ImagePicker.launchCameraAsync()` or `Camera` component

#### Microphone (RECORD_AUDIO)
- **Purpose**: Record audio for video prompts
- **Request**: Only when recording video
- **Location**: Requested via expo-camera when recording starts

#### Location (ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION)
- **Purpose**: Show nearby users for dating features
- **Request**: When user enables location-based matching
- **Location**: Requested via expo-location

#### Notifications (POST_NOTIFICATIONS)
- **Purpose**: Send match and message notifications
- **Request**: When user goes live or receives first match
- **Location**: Requested via expo-notifications

## Verification

To verify the final manifest does not contain broad media permissions:

```bash
# After building the Android app
npx expo prebuild --platform android --clean
cat android/app/src/main/AndroidManifest.xml | grep -i "READ_MEDIA"
```

Expected output: No matches (or only in comments)

If permissions appear, they are being added by a plugin and must be explicitly blocked.

## References

- [Expo ImagePicker v57 docs](https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker/)
- [expo-image-picker PR #31902](https://github.com/expo/expo/pull/31902)
- [Google Play Photo/Video Permissions Policy](https://support.google.com/googleplay/android-developer/answer/14115180)
- [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photopicker)
