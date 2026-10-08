const mockDisable = jest.fn(async () => undefined);
const mockEnable = jest.fn(async () => undefined);
const mockAppStateListeners: ((s: string) => void)[] = [];

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
  getApps: jest.fn(() => []),
  getApp: jest.fn(() => ({})),
}));
jest.mock('firebase/auth', () => ({ initializeAuth: jest.fn(), getAuth: jest.fn() }));
jest.mock('firebase/storage', () => ({ getStorage: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  initializeFirestore: jest.fn(() => ({ db: true })),
  getFirestore: jest.fn(() => ({ db: true })),
  disableNetwork: mockDisable,
  enableNetwork: mockEnable,
}));
jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('@/lib/env', () => ({
  env: { firebaseApiKey: 'k', firebaseProjectId: 'p', firebaseAppId: 'a' },
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: jest.fn((_: string, l: (s: string) => void) => mockAppStateListeners.push(l)) },
}));

const client = require('@/lib/firebase/client') as typeof import('@/lib/firebase/client');

describe('Firestore reconnect', () => {
  beforeAll(() => client.getDb());
  beforeEach(() => {
    mockDisable.mockClear();
    mockEnable.mockClear();
  });

  it('reconnects and retries once when the client thinks it is offline', async () => {
    const run = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' }))
      .mockResolvedValueOnce('ok');
    await expect(client.withReconnect(run)).resolves.toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
    expect(mockDisable).toHaveBeenCalledTimes(1);
    expect(mockEnable).toHaveBeenCalledTimes(1);
  });

  it('retries a timed-out write', async () => {
    const run = jest
      .fn()
      .mockRejectedValueOnce(new Error('Go live timed out after 12000ms. Check your internet connection.'))
      .mockResolvedValueOnce('ok');
    await expect(client.withReconnect(run)).resolves.toBe('ok');
  });

  it('does not retry real errors', async () => {
    const denied = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    const run = jest.fn().mockRejectedValue(denied);
    await expect(client.withReconnect(run)).rejects.toBe(denied);
    expect(run).toHaveBeenCalledTimes(1);
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it('gives up after the retry', async () => {
    const offline = Object.assign(new Error('offline'), { code: 'unavailable' });
    const run = jest.fn().mockRejectedValue(offline);
    await expect(client.withReconnect(run)).rejects.toBe(offline);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('reconnects after a long background, not a quick app switch', async () => {
    const now = jest.spyOn(Date, 'now');
    const emit = (s: string) => mockAppStateListeners.forEach((l) => l(s));
    now.mockReturnValue(0);
    emit('background');
    now.mockReturnValue(5_000);
    emit('active');
    expect(mockDisable).not.toHaveBeenCalled();
    emit('background');
    now.mockReturnValue(60_000);
    emit('active');
    await Promise.resolve();
    expect(mockDisable).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });
});
