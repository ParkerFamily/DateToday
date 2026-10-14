/**
 * Race and Ethnicity identity and preference options.
 *
 * Important context:
 * - Race and ethnicity are distinct but overlapping concepts
 * - Hispanic/Latino is an ethnicity that can overlap with racial identities
 * - Users can select multiple identities
 * - All questions are optional
 */

export const ETHNICITY_OPTIONS = [
  { value: 'black', label: 'Black / African American' },
  { value: 'white', label: 'White' },
  { value: 'hispanic_latino', label: 'Hispanic / Latino' },
  { value: 'east_asian', label: 'East Asian' },
  { value: 'south_asian', label: 'South Asian' },
  { value: 'southeast_asian', label: 'Southeast Asian' },
  { value: 'middle_eastern', label: 'Middle Eastern / North African' },
  { value: 'native_american', label: 'Native American / Alaska Native' },
  { value: 'pacific_islander', label: 'Native Hawaiian / Pacific Islander' },
  { value: 'multiracial', label: 'Multiracial / Mixed' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_say', label: 'Prefer not to say' },
] as const;

export type EthnicityValue = typeof ETHNICITY_OPTIONS[number]['value'];

export function ethnicityLabel(value: string): string {
  return ETHNICITY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function ethnicityLabels(values: string[] | null | undefined): string {
  if (!values?.length) return '';
  return values.map(ethnicityLabel).join(', ');
}
