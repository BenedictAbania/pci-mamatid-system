/** Explicit local presentation switch. No database approval or publication uses it. */
export const DEMO_PREVIEW_ENABLED = process.env.EXPO_PUBLIC_LAKAD_DEMO_PREVIEW === 'true';

export function readScenarioNumber(value: string, label: string, maximum?: number) {
  if (!value.trim()) throw new Error(`Enter ${label}.`);
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (maximum !== undefined && number > maximum)) {
    throw new Error(`Enter a valid ${label}${maximum === undefined ? '' : ` from 0 to ${maximum}`}.`);
  }
  return number;
}
