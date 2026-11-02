import type { PinState } from '@/features/assets/stationPins';

/** One entry of an Assets place row's menu, in the order it is offered. */
export type PlaceMenuAction =
  'setWaypoint' | 'addWaypoint' | 'openInEve' | 'copyName' | 'rename' | 'togglePin';

/**
 * Which actions a place row's menu offers. A station or structure row is a
 * place; a container row offers the place it sits in. An unresolved place (an
 * orphan group, or a container whose station is unknown) has nothing to send
 * to the client, so only the name copies. Only what applies: no disabled wall.
 */
export function placeMenuActions({
  kind,
  pinnable,
  renamable = false,
  resolved,
}: {
  kind: 'station' | 'container';
  pinnable: boolean;
  /** The page keeps Place Nicknames (Assets, not corp): offers Rename on a station. */
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

/** The menu item's label key: the step the pin toggle takes next. */
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
