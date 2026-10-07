#!/usr/bin/env node
/**
 * Fix corrupted profile data in Firestore
 */

const admin = require('firebase-admin');

// Initialize
admin.initializeApp({
  projectId: 'datetoday-e1331',
});

const db = admin.firestore();

async function fixProfile(userId, legalName, displayName) {
  console.log('🔧 Fixing profile for:', userId);
  console.log('Legal Name:', legalName);
  console.log('Display Name:', displayName);
  console.log('');

  try {
    // Read current
    const userRef = db.collection('users').doc(userId);
    const profileRef = db.collection('profiles').doc(userId);
    
    const [userSnap, profileSnap] = await Promise.all([
      userRef.get(),
      profileRef.get(),
    ]);

    if (!userSnap.exists) {
      console.error('❌ User not found!');
      return;
    }

    const userData = userSnap.data();
    const profileData = profileSnap.exists ? profileSnap.data() : {};

    console.log('📖 Current data:');
    console.log('  Legal Name:', userData.legalName || 'NOT SET');
    console.log('  Display Name:', userData.displayName || 'NOT SET');
    console.log('  Profile Display:', profileData.displayName || 'NOT SET');
    console.log('');

    // Update
    console.log('💾 Updating...');
    await userRef.update({
      legalName,
      displayName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    await profileRef.update({
      displayName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ Updated!');
    console.log('');

    // Verify
    const [newUserSnap, newProfileSnap] = await Promise.all([
      userRef.get(),
      profileRef.get(),
    ]);

    const newUserData = newUserSnap.data();
    const newProfileData = newProfileSnap.data();

    console.log('✅ Verified:');
    console.log('  Legal Name:', newUserData.legalName);
    console.log('  Display Name:', newUserData.displayName);
    console.log('  Profile Display:', newProfileData.displayName);
    console.log('');
    console.log('🎉 Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

const [userId, legalName, displayName] = process.argv.slice(2);
if (!userId || !legalName || !displayName) {
  console.error('Usage: node fix-profile-simple.js <userId> <legalName> <displayName>');
  process.exit(1);
}

fixProfile(userId, legalName, displayName)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
