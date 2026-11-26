import type { StationPinRecord, StationPinScope } from '@/db';

export type PinState = 'unpinned' | StationPinScope;

export function nextPinState(current: PinState): PinState {
  if (current === 'unpinned') return 'character';
  if (current === 'character') return 'account';
  return 'unpinned';
}

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
