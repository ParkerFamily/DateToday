#!/usr/bin/env tsx
/**
 * Fix corrupted profile data in Firestore
 * Usage: tsx scripts/fix-profile-data.ts <userId> <legalName> <displayName>
 * Example: tsx scripts/fix-profile-data.ts HvojrnHYUsZsQk3VmXF35lwsbkq2 "OG BOBBY JOHNSON" "Bobby"
 */

import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getDb, getFirebaseAuth } from '../lib/firebase/client';

async function fixProfileData(userId: string, legalName: string, displayName: string) {
  console.log('🔧 Starting profile data fix...');
  console.log(`User ID: ${userId}`);
  console.log(`Legal Name: ${legalName}`);
  console.log(`Display Name: ${displayName}`);
  console.log('');

  try {
    const db = getDb();
    
    // 1. Fetch current data
    console.log('📖 Reading current profile data...');
    const userRef = doc(db, 'users', userId);
    const profileRef = doc(db, 'profiles', userId);
    
    const [userSnap, profileSnap] = await Promise.all([
      getDoc(userRef),
      getDoc(profileRef),
    ]);

    if (!userSnap.exists()) {
      console.error('❌ User document not found!');
      return;
    }

    const userData = userSnap.data();
    const profileData = profileSnap.exists() ? profileSnap.data() : null;

    console.log('Current data:');
    console.log(`  Legal Name: ${userData.legalName || 'NOT SET'}`);
    console.log(`  Display Name: ${userData.displayName || 'NOT SET'}`);
    if (profileData) {
      console.log(`  Profile Display Name: ${profileData.displayName || 'NOT SET'}`);
    }
    console.log('');

    // 2. Update users/{uid} - private data including legal name
    console.log('💾 Updating users document...');
    await setDoc(
      userRef,
      {
        legalName,
        displayName,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    console.log('✅ Users document updated');

    // 3. Update profiles/{uid} - public data with display name
    console.log('💾 Updating profiles document...');
    await setDoc(
      profileRef,
      {
        displayName,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    console.log('✅ Profiles document updated');

    // 4. Verify changes
    console.log('');
    console.log('🔍 Verifying changes...');
    const [updatedUserSnap, updatedProfileSnap] = await Promise.all([
      getDoc(userRef),
      getDoc(profileRef),
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
  console.error('Usage: tsx scripts/fix-profile-data.ts <userId> <legalName> <displayName>');
  console.error('Example: tsx scripts/fix-profile-data.ts HvojrnHYUsZsQk3VmXF35lwsbkq2 "OG BOBBY JOHNSON" "Bobby"');
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
