export const DOGMA_UNIT = {
  milliseconds: 101,
  inverseAbsolutePercent: 108,
  modifierPercent: 109,
  inversedModifierPercent: 111,
  absolutePercent: 127,
} as const;

const CONVERSIONS: Readonly<Record<number, { show: (v: number) => number; slope: number }>> = {
  [DOGMA_UNIT.milliseconds]: { show: (v) => v / 1000, slope: 1 / 1000 },
  [DOGMA_UNIT.inverseAbsolutePercent]: { show: (v) => (1 - v) * 100, slope: -100 },
  [DOGMA_UNIT.modifierPercent]: { show: (v) => (v - 1) * 100, slope: 100 },
  [DOGMA_UNIT.inversedModifierPercent]: { show: (v) => (1 - v) * 100, slope: -100 },
  [DOGMA_UNIT.absolutePercent]: { show: (v) => v * 100, slope: 100 },
};

export function displayAttributeValue(
  value: number,
  unitId: number | undefined,
  unit: string | null
): { value: number; unit: string | null } {
  const conversion = unitId === undefined ? undefined : CONVERSIONS[unitId];
  return { value: conversion ? conversion.show(value) : value, unit };
}

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
