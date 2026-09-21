/**
 * Autolinking overrides.
 * Android IAP is deferred — do not link RevenueCat native Billing on Android
 * until a goog_ key is ready. Re-enable by deleting the android: null block.
 */
module.exports = {
  dependencies: {
    'react-native-purchases': {
      platforms: {
        android: null,
      },
    },
  },
};
