# Deployment Guide - Message & Performance Fixes

## Overview
This guide covers deploying the fixes for message saving, push notifications, inline reply, app performance, and navigation issues.

## Pre-Deployment Checklist
- [ ] All changes have been tested locally
- [ ] PR #2 has been reviewed and approved
- [ ] Backup current Firebase rules and functions (just in case)

## Deployment Steps

### Step 1: Deploy Firebase Backend (CRITICAL - DO FIRST)

**Important**: Deploy backend before the mobile app to avoid client/server incompatibilities.

```bash
# Navigate to your project directory
cd /path/to/DateToday

# Login to Firebase (if not already logged in)
firebase login

# Deploy Firestore Security Rules
firebase deploy --only firestore:rules

# Deploy Cloud Functions
firebase deploy --only functions

# Verify deployment
firebase functions:log --limit 5
```

**Expected Output**:
- Firestore rules deployed successfully
- Functions deployed: `onMatchMessageCreated`, `notificationAction`, etc.
- No errors in recent logs

### Step 2: Test Backend Changes

Before deploying the mobile app, test the backend:

1. **Test Message Saving**:
   - Use Firebase Console or Postman to test message creation
   - Verify the new security rules accept messages with correct fields
   - Verify they reject messages with extra fields

2. **Test Cloud Function**:
   - Send a test message
   - Check Firebase Cloud Functions logs: `firebase functions:log`
   - Look for: "onMatchMessageCreated" logs
   - Verify notification title is "New message from [name]"

3. **Test Notification Action**:
   - Check that `notificationAction` function is deployed
   - Verify it has the new error logging

### Step 3: Build Mobile App

```bash
# For iOS (TestFlight/App Store)
eas build --platform ios --profile production

# For Android (Google Play)
eas build --platform android --profile production

# Or if you need both
eas build --platform all --profile production
```

### Step 4: Test on TestFlight/Internal Testing

**Critical Tests**:

1. **Message Sending**:
   - [ ] Send text messages between users
   - [ ] Verify messages save and appear immediately
   - [ ] Check console logs for detailed logging

2. **Push Notifications**:
   - [ ] Send message while receiver is backgrounded
   - [ ] Verify notification title: "New message from [Name]"
   - [ ] Verify notification body shows message preview

3. **Inline Reply**:
   - [ ] Reply from notification without opening app
   - [ ] If it fails, check console logs for detailed error
   - [ ] Verify "Reply not sent" shows helpful error message

4. **Navigation**:
   - [ ] Rapidly tap on a message 5+ times
   - [ ] Verify chat only opens ONCE
   - [ ] Check logs for "Navigation already in progress" messages

5. **Conversation Loading**:
   - [ ] Open various chats
   - [ ] Verify messages load quickly
   - [ ] Check logs for subscription lifecycle messages

6. **Real-time Updates**:
   - [ ] Send message from another device
   - [ ] Verify it appears in match list immediately
   - [ ] Check logs for "Matches: received update"

7. **Performance**:
   - [ ] Scroll through discovery feed
   - [ ] Verify images load smoothly
   - [ ] Scroll back up - images should load instantly (cached)
   - [ ] No jank or lag

### Step 5: Monitor After Deployment

**Watch These Metrics**:
- Firebase Cloud Functions error rate
- Message delivery success rate
- Push notification delivery rate
- App crash rate (Sentry/Crashlytics)
- User reports of navigation issues

**Key Logs to Monitor**:
```bash
# Watch Cloud Functions logs in real-time
firebase functions:log --follow

# Look for these log messages:
# - "onMatchMessageCreated: match updated"
# - "onMatchMessageCreated: push failed" (should be rare)
# - "performNotificationAction: calling API"
# - "Matches: received update"
# - "ChatScreen: messages updated"
```

### Step 6: Production Release

Once TestFlight/Internal testing passes:

1. **iOS**: Submit to App Store for review
2. **Android**: Promote to production in Google Play Console
3. **Monitor**: Watch crash reports and user feedback closely for first 24 hours

## Rollback Plan

If critical issues arise:

### Rollback Firebase Backend:
```bash
# Restore previous Firestore rules (from backup or git)
firebase deploy --only firestore:rules

# Rollback Cloud Functions to previous version
# (Use Firebase Console: Functions → Version History → Rollback)
```

### Rollback Mobile App:
- **iOS**: Remove from App Store review or release previous version
- **Android**: Rollback in Google Play Console (previous versions remain available)

## Troubleshooting

### Messages Not Saving
- Check Firebase Console → Firestore → Rules
- Verify the `hasOnly()` validation is correct
- Check app logs for Firestore permission errors

### Push Notifications Not Working
- Check Firebase Cloud Functions logs
- Look for "onMatchMessageCreated: push failed" errors
- Verify push tokens are being registered (check `pushTokens` collection)

### Inline Reply Still Failing
- Check console logs for detailed error from `performNotificationAction`
- Common issues: expired auth token, network errors, missing permissions
- Verify `notificationAction` function is deployed and accessible

### Navigation Still Opening Multiple Times
- Check console logs for "Navigation already in progress" messages
- If still happening, increase the timeout from 1000ms to 2000ms
- Verify the ref-based lock is working

### Conversations Not Loading
- Check console logs for subscription errors
- Look for "ChatScreen: match subscription error" messages
- Verify Firestore rules allow reading match and message documents

## Success Criteria

Deployment is successful when:
- ✅ All messages save successfully (0 errors in 24 hours)
- ✅ Push notifications have descriptive titles
- ✅ Inline reply works or shows helpful error
- ✅ No reports of navigation spam (chat opening multiple times)
- ✅ Conversations load within 2 seconds
- ✅ Message list updates in real-time
- ✅ App feels smooth and responsive
- ✅ No increase in crash rate
- ✅ User complaints about lag have stopped

## Support

If you encounter issues during deployment:
- Check the comprehensive logs added in this update
- Review PR #2 for technical details
- Check Firebase Cloud Functions logs
- Review app console logs (Sentry/native console)

---

**Note**: This deployment includes significant logging improvements. Use these logs to diagnose any issues quickly. The logs will help identify exactly where failures occur in the message → save → notify → display pipeline.
