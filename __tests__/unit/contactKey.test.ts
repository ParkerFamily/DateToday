import { contactKey, maskContact, typedContactKey } from '@/lib/contactKey';

const server = require('../../functions/contactBlocks');

const PHONES = ['+1 (555) 123-4567', '555.123.4567', '5551234567', '+44 7911 123456', '07911 123456', '12345', '', '+1 555 12'];
const EMAILS = [' J.Doe+dating@GoogleMail.com ', 'jdoe@gmail.com', 'Amy@Example.co.uk', 'nope', 'a@b', ''];

describe('contact keys', () => {
  it('match the server exactly, so hashes line up', () => {
    for (const p of PHONES) expect(contactKey('phone', p)).toBe(server.contactKey('phone', p));
    for (const e of EMAILS) expect(contactKey('email', e)).toBe(server.contactKey('email', e));
  });

  it('reads typed input as an email or a number', () => {
    expect(typedContactKey('555-123-4567')).toBe('p:5551234567');
    expect(typedContactKey('Amy@Example.com')).toBe('e:amy@example.com');
    expect(typedContactKey('hello')).toBeNull();
  });

  it('masks what is shown in the list', () => {
    expect(maskContact('+1 (555) 123-4567')).toBe('•••• 4567');
    expect(maskContact('Amy.Smith@Example.com')).toBe('a•••@example.com');
  });
});
