type TokenListener = (t: { type: string; data: string }) => void;

const mockListeners: TokenListener[] = [];
let mockDeviceToken = 'apns-A';
const mockSetDoc = jest.fn(async () => undefined);

jest.mock('expo-notifications', () => ({
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  // iOS re-registers on every fetch and emits the token event each time.
  getExpoPushTokenAsync: jest.fn(async () => {
    setTimeout(() => mockListeners.forEach((l) => l({ type: 'ios', data: mockDeviceToken })), 0);
    return { data: `ExponentPushToken[${mockDeviceToken}]` };
  }),
  addPushTokenListener: jest.fn((l: TokenListener) => {
    mockListeners.push(l);
    return { remove: () => mockListeners.splice(mockListeners.indexOf(l), 1) };
  }),
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.2', extra: { eas: { projectId: 'p' } } } }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({})),
  getDoc: jest.fn(async () => ({ exists: () => true, data: () => ({ uid: 'u1' }) })),
  setDoc: mockSetDoc,
  deleteDoc: jest.fn(async () => undefined),
  updateDoc: jest.fn(async () => undefined),
  serverTimestamp: jest.fn(() => 'ts'),
}));
jest.mock('@/lib/firebase/client', () => ({
  getDb: () => ({}),
  getFirebaseAuth: () => ({ currentUser: { uid: 'u1' } }),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios', Version: '26', constants: {} } }));

const flush = () => new Promise((r) => setTimeout(r, 5));

describe('push token registration', () => {
  it('does not loop when iOS emits the token on every fetch', async () => {
    const { registerPushTokenAsync, listenForPushTokenChanges } = require('@/features/notifications/push');
    const stop = listenForPushTokenChanges();
    await registerPushTokenAsync();
    for (let i = 0; i < 10; i++) await flush();
    await registerPushTokenAsync({ prompt: true });
    for (let i = 0; i < 10; i++) await flush();
    expect(mockSetDoc).toHaveBeenCalledTimes(1);

    mockDeviceToken = 'apns-B';
    mockListeners.forEach((l) => l({ type: 'ios', data: mockDeviceToken }));
    for (let i = 0; i < 10; i++) await flush();
    expect(mockSetDoc).toHaveBeenCalledTimes(2);
    stop();
  });
});
