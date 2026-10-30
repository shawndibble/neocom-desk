import type { TradeHub } from '@/market/hubs';

export type HubId = TradeHub['id'];
export type Variant = 'A' | 'B' | 'C';

export interface MockCharacter {
  characterId: number;
  name: string;
  hub: HubId;
}

export const FOUR: readonly MockCharacter[] = [
  { characterId: 2119876543, name: 'Kestrel Vane', hub: 'jita' },
  { characterId: 2119876544, name: 'Orsa Tellemar', hub: 'hek' },
  { characterId: 2119876545, name: 'Brann Idoyo', hub: 'amarr' },
  { characterId: 2119876546, name: 'Veya Soren', hub: 'jita' },
];
export const ONE: readonly MockCharacter[] = FOUR.slice(0, 1);
