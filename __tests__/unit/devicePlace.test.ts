jest.mock('@/features/security/session', () => ({ securityPost: jest.fn(), useDeviceSecurity: { getState: () => ({}) } }));
jest.mock('@/lib/firebase/client', () => ({ getDb: () => ({}), getFirebaseAuth: () => ({}) }));

import { placeLabel } from '@/features/security/devices';

const server: { placeLabel: typeof placeLabel } = require('../../functions/sessions');

const cases = [
  { city: 'Dallas', region: 'TX', country: 'United States', countryCode: 'US' },
  { city: 'Toronto', region: 'ON', country: 'Canada', countryCode: 'CA' },
  { city: 'London', region: 'ENG', country: 'United Kingdom', countryCode: 'GB' },
  { city: '', region: '', country: 'France', countryCode: 'FR' },
];

describe('device location label', () => {
  it('matches what the server puts in sign-in alerts', () => {
    for (const c of cases) expect(placeLabel(c)).toBe(server.placeLabel(c));
    expect(placeLabel(null)).toBe('');
    expect(placeLabel(cases[0])).toBe('Dallas, TX');
  });
});
