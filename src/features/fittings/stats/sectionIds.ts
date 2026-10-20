/** Stable ids — the remembered layout (`statsSectionsPreference.ts`) is keyed on them. */
export type Section =
  | 'assumptions'
  | 'whatToTrain'
  | 'yourCharacters'
  | 'offense'
  | 'appliedDps'
  | 'defense'
  | 'capacitor'
  | 'support'
  | 'mining'
  | 'fleetBoosts'
  | 'projected'
  | 'abyssal'
  | 'targeting'
  | 'navigation'
  | 'drones'
  | 'fighters'
  | 'fitting'
  | 'price';

/** Open at first: what a pilot reads on every fit. The rest is a click away, as in the game window. */
export const OPEN_BY_DEFAULT: ReadonlySet<Section> = new Set([
  'offense',
  'appliedDps',
  'defense',
  'capacitor',
  // Only there at all when the fit has something to show in it.
  'support',
  'mining',
  'fleetBoosts',
  'navigation',
  'drones',
  'fighters',
]);
