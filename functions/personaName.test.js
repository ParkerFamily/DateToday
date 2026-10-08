const test = require('node:test');
const assert = require('node:assert');
const { legalNameFromInquiry } = require('./personaName');

const inquiry = (fields) => ({
  attributes: { fields: Object.fromEntries(Object.entries(fields).map(([k, value]) => [k, { value }])) },
});

test('builds the full ID name, fixing all-caps', () => {
  assert.strictEqual(
    legalNameFromInquiry(inquiry({ 'name-first': 'JANE', 'name-middle': 'ANNE', 'name-last': "O'NEIL-SMITH" })),
    "Jane Anne O'Neil-Smith",
  );
});

test('keeps mixed-case names as written', () => {
  assert.strictEqual(
    legalNameFromInquiry(inquiry({ 'name-first': 'DeShawn', 'name-last': 'McKenzie' })),
    'DeShawn McKenzie',
  );
});

test('null without both first and last name', () => {
  assert.strictEqual(legalNameFromInquiry(inquiry({ 'name-first': 'Jane' })), null);
  assert.strictEqual(legalNameFromInquiry({}), null);
  assert.strictEqual(legalNameFromInquiry(null), null);
});

test('reads legacy top-level attributes', () => {
  assert.strictEqual(
    legalNameFromInquiry({ attributes: { 'name-first': 'jane', 'name-last': 'doe' } }),
    'Jane Doe',
  );
});
