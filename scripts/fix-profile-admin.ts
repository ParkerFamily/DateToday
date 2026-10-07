#!/usr/bin/env tsx
/**
 * Fix corrupted profile data in Firestore using Admin SDK
 * Usage: tsx scripts/fix-profile-admin.ts <userId> <legalName> <displayName>
 */

import admin from 'firebase-admin';

// Initialize Firebase Admin with the project ID from config
try {
  admin.initializeApp({
    projectId: 'datetoday-e1331',
  });
} catch (error) {
  // Already initialized
}

const db = admin.firestore();

async function fixProfileData(userId: string, legalName: string, displayName: string) {
  console.log('🔧 Starting profile data fix...');
  console.log(`User ID: ${userId}`);
  console.log(`Legal Name: ${legalName}`);
  console.log(`Display Name: ${displayName}`);
  console.log('');

  try {
    // 1. Fetch current data
    console.log('📖 Reading current profile data...');
    const userRef = db.collection('users').doc(userId);
    const profileRef = db.collection('profiles').doc(userId);
    
    const [userSnap, profileSnap] = await Promise.all([
      userRef.get(),
      profileRef.get(),
    ]);

    if (!userSnap.exists) {
      console.error('❌ User document not found!');
      return;
    }

    const userData = userSnap.data();
    const profileData = profileSnap.exists ? profileSnap.data() : null;

    console.log('Current data:');
    console.log(`  Legal Name: ${userData?.legalName || 'NOT SET'}`);
    console.log(`  Display Name: ${userData?.displayName || 'NOT SET'}`);
    if (profileData) {
      console.log(`  Profile Display Name: ${profileData.displayName || 'NOT SET'}`);
    }
    console.log('');

    // 2. Update users/{uid}
    console.log('💾 Updating users document...');
    await userRef.update({
      legalName,
      displayName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('✅ Users document updated');

    // 3. Update profiles/{uid}
    console.log('💾 Updating profiles document...');
    await profileRef.update({
      displayName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('✅ Profiles document updated');

    // 4. Verify
    console.log('');
    console.log('🔍 Verifying changes...');
    const [updatedUserSnap, updatedProfileSnap] = await Promise.all([
      userRef.get(),
      profileRef.get(),
    ]);

    const updatedUserData = updatedUserSnap.data();
    const updatedProfileData = updatedProfileSnap.data();

    console.log('Updated data:');
    console.log(`  Legal Name: ${updatedUserData?.legalName}`);
    console.log(`  Display Name: ${updatedUserData?.displayName}`);
    console.log(`  Profile Display Name: ${updatedProfileData?.displayName}`);
    console.log('');
    console.log('✅ Profile data fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing profile data:', error);
    throw error;
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length !== 3) {
  console.error('Usage: tsx scripts/fix-profile-admin.ts <userId> <legalName> <displayName>');
  console.error('Example: tsx scripts/fix-profile-admin.ts HvojrnHYUsZsQk3VmXF35lwsbkq2 "OG BOBBY JOHNSON" "Bobby"');
  process.exit(1);
}

const [userId, legalName, displayName] = args;

// Run the fix
fixProfileData(userId, legalName, displayName)
  .then(() => {
    console.log('');
    console.log('🎉 Done! The profile has been fixed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('');
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
