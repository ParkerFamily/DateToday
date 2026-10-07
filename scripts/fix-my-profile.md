# Fix Profile Data - Manual Steps

## Your Corrupted Profile:
- **User ID**: `HvojrnHYUsZsQk3VmXF35lwsbkq2`
- **Current Legal Name**: Bob Smith (WRONG)
- **Current Display Name**: Vito (WRONG)
- **Correct Name**: OG BOBBY JOHNSON

## Option A: Fix via Firebase Console (Easiest)

1. Go to [Firebase Console](https://console.firebase.google.com/project/datetoday-e1331/firestore)
2. Navigate to Firestore Database
3. Find collection `users` → Document `HvojrnHYUsZsQk3VmXF35lwsbkq2`
4. Update fields:
   - `legalName`: "OG BOBBY JOHNSON"
   - `displayName`: "Bobby" (or "OG BOBBY JOHNSON")
5. Find collection `profiles` → Document `HvojrnHYUsZsQk3VmXF35lwsbkq2`
6. Update field:
   - `displayName`: "Bobby" (or "OG BOBBY JOHNSON")

## Option B: Use Firebase Admin SDK Script

Create `.env` file with Firebase service account credentials, then run the automated script.

## Option C: Fix in App

1. Open app
2. Go to Settings → Edit Profile
3. Change display name (legal name is locked after first save)
4. This won't fix legal name but will fix what others see
