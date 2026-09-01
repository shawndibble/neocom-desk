/**
 * Pure Station Pin state helpers (issue #84, CONTEXT.md §5.7 fan-out): cycling
 * a pin through unpinned -> character -> account -> unpinned, and deriving
 * one station's pin state for the currently active Character from the raw
 * pin records. The Dexie writes/tombstones themselves live in src/sync
 * (setCharacterStationPin, setAccountStationPin, clearStationPin) since
 * account-wide pins need the same tombstone bookkeeping every other Editable
 * Data collection uses.
 */
import type { StationPinRecord, StationPinScope } from '@/db';

export type PinState = 'unpinned' | StationPinScope;

/** Cycles a station's pin state on each click. */
export function nextPinState(current: PinState): PinState {
  if (current === 'unpinned') return 'character';
  if (current === 'character') return 'account';
  return 'unpinned';
}

/**
 * A station's pin state as seen by one active Character: an `account` pin
 * from ANY Character elevates the station regardless of who is active; a
 * `character` pin only elevates it while that specific Character is active.
 */
export function pinStateForStation(
  pins: readonly StationPinRecord[],
  activeCharacterId: number,
  locationId: number
): PinState {
  let ownCharacterPin = false;
  for (const pin of pins) {
    if (pin.locationId !== locationId) continue;
    if (pin.scope === 'account') return 'account';
    if (pin.characterId === activeCharacterId) ownCharacterPin = true;
  }
  return ownCharacterPin ? 'character' : 'unpinned';
}
