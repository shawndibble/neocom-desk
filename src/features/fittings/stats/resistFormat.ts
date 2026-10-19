import type { Resonances } from '@/engine/fittings/types';

export const DMG_FILL_CLASS = {
  em: 'bg-dmg-em',
  thermal: 'bg-dmg-thermal',
  kinetic: 'bg-dmg-kinetic',
  explosive: 'bg-dmg-explosive',
} as const;

export const DMG_TEXT_CLASS = {
  em: 'text-dmg-em',
  thermal: 'text-dmg-thermal',
  kinetic: 'text-dmg-kinetic',
  explosive: 'text-dmg-explosive',
} as const;

export type DamageType = keyof typeof DMG_FILL_CLASS;

export const RESIST_TYPES = Object.keys(DMG_FILL_CLASS) as DamageType[];

export const RESONANCE_KEY = {
  em: 'emResonance',
  thermal: 'thermalResonance',
  kinetic: 'kineticResonance',
  explosive: 'explosiveResonance',
} as const satisfies Record<DamageType, keyof Resonances>;

const EHP_FORMAT = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

/** Whole hit points, grouped: "64,745". */
export function formatEhp(ehp: number): string {
  return EHP_FORMAT.format(ehp);
}
