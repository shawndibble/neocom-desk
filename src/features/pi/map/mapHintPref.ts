/**
 * Whether the pilot dismissed the Map's first-visit hint. Per device, in
 * localStorage, and guarded: storage can be blocked or throw (private windows,
 * cleared site data), and the hint then simply shows again.
 */
export const MAP_HINT_KEY = 'neocom.pi.mapHintDismissed';

export function readMapHintDismissed(): boolean {
  try {
    return localStorage.getItem(MAP_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeMapHintDismissed(): void {
  try {
    localStorage.setItem(MAP_HINT_KEY, '1');
  } catch {
    // Not remembered: the hint shows again next visit.
  }
}
