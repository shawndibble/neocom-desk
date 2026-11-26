export type Section =
  | 'whatToTrain'
  | 'yourCharacters'
  | 'offense'
  | 'appliedDps'
  | 'defense'
  | 'capacitor'
  | 'support'
  | 'mining'
  | 'exploration'
  | 'fleetBoosts'
  | 'projected'
  | 'abyssal'
  | 'targeting'
  | 'navigation'
  | 'drones'
  | 'fighters'
  | 'fitting'
  | 'price';

export const OPEN_BY_DEFAULT: ReadonlySet<Section> = new Set([
  'offense',
  'appliedDps',
  'defense',
  'capacitor',
  'support',
  'mining',
  'exploration',
  'fleetBoosts',
  'navigation',
  'drones',
  'fighters',
]);
