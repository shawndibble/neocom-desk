/**
 * Pinned-item list for the Market Browser compare table. Plain component
 * state (not persisted) — CONTEXT.md's Market Browser scope only calls out
 * the Trade Hub selection as a persisted preference.
 */
import type { TypeSearchResult } from './search';

export interface PinnedType {
  typeId: number;
  name: string;
  volume: number;
}

/** Compare table cap (CONTEXT.md scope: "pin up to 10 items"). */
export const MAX_PINS = 10;

function toPinned(result: TypeSearchResult): PinnedType {
  return { typeId: result.typeId, name: result.name, volume: result.volume };
}

/**
 * Adds a result to the pinned list. No-op (returns the same array reference)
 * when already pinned or at MAX_PINS — callers should disable the pin
 * control in both cases rather than relying on this silently doing nothing.
 */
export function addPin(pins: PinnedType[], result: TypeSearchResult): PinnedType[] {
  if (pins.length >= MAX_PINS) return pins;
  if (pins.some((p) => p.typeId === result.typeId)) return pins;
  return [...pins, toPinned(result)];
}

export function removePin(pins: PinnedType[], typeId: number): PinnedType[] {
  return pins.filter((p) => p.typeId !== typeId);
}
