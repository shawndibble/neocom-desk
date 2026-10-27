/**
 * A dogma attribute's value as text, the way the game shows it — a rate of
 * fire in seconds rather than milliseconds, a resonance as a resistance —
 * with its unit. Shared by the module dialog's Affected by and Mutation
 * sections, so the two never print one value two ways.
 */
import { displayAttributeValue } from '@/engine/fittings/attributeUnits';
import type { AttributeDictionaryEntry } from '@/sde/marketTypes';

/** Enough precision for a multiplier like ×0.869 without trailing noise. */
export function formatAttributeNumber(value: number): string {
  return Number(value.toPrecision(4)).toString();
}

/** `value` (raw dogma) in the unit `entry` names, e.g. "10.5 s"; bare when it has none. */
export function attributeValueText(value: number, entry: AttributeDictionaryEntry): string {
  const display = displayAttributeValue(value, entry.unitId, entry.unit);
  return `${formatAttributeNumber(display.value)}${display.unit ? ` ${display.unit}` : ''}`;
}
