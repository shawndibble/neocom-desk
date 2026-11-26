import type { PinState } from '@/features/assets/stationPins';

export type PlaceMenuAction =
  'setWaypoint' | 'addWaypoint' | 'openInEve' | 'copyName' | 'rename' | 'togglePin';

export function placeMenuActions({
  kind,
  pinnable,
  renamable = false,
  resolved,
}: {
  kind: 'station' | 'container';
  pinnable: boolean;
  renamable?: boolean;
  resolved: boolean;
}): PlaceMenuAction[] {
  if (!resolved) return ['copyName'];
  if (kind === 'container') return ['setWaypoint', 'addWaypoint', 'copyName'];
  return [
    'setWaypoint',
    'addWaypoint',
    'openInEve',
    'copyName',
    ...(renamable ? (['rename'] as const) : []),
    ...(pinnable ? (['togglePin'] as const) : []),
  ];
}

export function nextPinLabelKey(state: PinState): string {
  switch (state) {
    case 'unpinned':
      return 'assets.pin.pinCharacter';
    case 'character':
      return 'assets.pin.pinAccount';
    case 'account':
      return 'assets.pin.unpin';
  }
}
