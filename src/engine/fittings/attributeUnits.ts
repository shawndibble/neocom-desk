/**
 * A dogma attribute's value as the game shows it, by its SDE unit id
 * (`eveUnits`; carried in `public/data/market/attributes.json` as
 * `unitId`). The raw value is not what a player reads for every unit: a
 * rate of fire is stored in milliseconds, a resonance of 0.75 is a 25%
 * resistance, a modifier of 1.1 is +10%, and a share of 0.01 is 1%. The
 * unit's display string alone can't tell those apart — all of them but the
 * first show as "%". Pure.
 */

/** SDE unit ids whose raw value is not what the game shows. */
export const DOGMA_UNIT = {
  milliseconds: 101,
  inverseAbsolutePercent: 108,
  modifierPercent: 109,
  inversedModifierPercent: 111,
  absolutePercent: 127,
} as const;

/** Raw value → shown value, and the slope of that mapping (for an added amount). */
const CONVERSIONS: Readonly<Record<number, { show: (v: number) => number; slope: number }>> = {
  [DOGMA_UNIT.milliseconds]: { show: (v) => v / 1000, slope: 1 / 1000 },
  [DOGMA_UNIT.inverseAbsolutePercent]: { show: (v) => (1 - v) * 100, slope: -100 },
  [DOGMA_UNIT.modifierPercent]: { show: (v) => (v - 1) * 100, slope: 100 },
  [DOGMA_UNIT.inversedModifierPercent]: { show: (v) => (1 - v) * 100, slope: -100 },
  [DOGMA_UNIT.absolutePercent]: { show: (v) => v * 100, slope: 100 },
};

/**
 * `value` in the unit the game shows it in. `unit` is the unit's display
 * string, passed through (milliseconds show as "s"). An unknown unit id
 * leaves the value as it is.
 */
export function displayAttributeValue(
  value: number,
  unitId: number | undefined,
  unit: string | null
): { value: number; unit: string | null } {
  const conversion = unitId === undefined ? undefined : CONVERSIONS[unitId];
  return { value: conversion ? conversion.show(value) : value, unit };
}

/**
 * A modifier's own value, shown against an attribute of `unitId`. An
 * assigned value is one of the attribute's, so it converts the same way;
 * an added or subtracted amount scales by the unit (a positive slope only —
 * a resonance's +0.1 would read as −10 behind a "+"); a percentage, a
 * multiplier or a divisor is in its own unit and stays as it is.
 */
export function displaySourceValue(
  operator: string,
  value: number,
  unitId: number | undefined
): number {
  const conversion = unitId === undefined ? undefined : CONVERSIONS[unitId];
  if (!conversion) return value;
  if (operator === 'pre_assign' || operator === 'post_assign') return conversion.show(value);
  if ((operator === 'mod_add' || operator === 'mod_sub') && conversion.slope > 0)
    return value * conversion.slope;
  return value;
}
