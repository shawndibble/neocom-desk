import type { CharacterAffiliation } from '@/esi/endpoints';

/** Shared module-level empties: stable identity, so hook fallbacks don't invalidate memos every render. */
export const NO_NAMES: ReadonlyMap<number, string> = new Map();
export const NO_AFFILIATIONS: ReadonlyMap<number, CharacterAffiliation> = new Map();
export const NO_NUMBERS: ReadonlyMap<number, number> = new Map();
