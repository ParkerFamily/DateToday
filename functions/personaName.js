/** IDs are often all caps ("JANE DOE"); mixed-case names ("McKenzie", "DeShawn") are kept as given. */
function tidyCase(word) {
  if (word !== word.toUpperCase() && word !== word.toLowerCase()) return word;
  return word
    .toLowerCase()
    .replace(/(^|[-'’])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

function fieldValue(attributes, key) {
  const fields = (attributes && attributes.fields) || {};
  const v = (fields[key] && fields[key].value) ?? (attributes && attributes[key]);
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
}

/** Full name from the verified ID on a Persona inquiry, or null if Persona didn't read one. */
function legalNameFromInquiry(inquiry) {
  const a = (inquiry && inquiry.attributes) || {};
  const first = fieldValue(a, 'name-first');
  const last = fieldValue(a, 'name-last');
  if (!first || !last) return null;
  const full = [first, fieldValue(a, 'name-middle'), last]
    .filter(Boolean)
    .join(' ')
    .split(' ')
    .map(tidyCase)
    .join(' ');
  return full.slice(0, 80);
}

module.exports = { legalNameFromInquiry };
