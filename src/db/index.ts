import Dexie, { type EntityTable } from 'dexie';

export interface CharacterRecord {
  characterId: number;
  name: string;
  ownerHash: string;
  /** Epoch ms when the character was first added. */
  addedAt: number;
}

// Refresh tokens NEVER leave this device: stored only in local IndexedDB,
// sent only to login.eveonline.com for refresh grants. No backend, no sync.
export interface TokenRecord {
  characterId: number;
  accessToken: string;
  refreshToken: string;
  /** Access token expiry, epoch ms. */
  expiresAt: number;
  scopes: string[];
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export const db = new Dexie('neocom') as Dexie & {
  characters: EntityTable<CharacterRecord, 'characterId'>;
  tokens: EntityTable<TokenRecord, 'characterId'>;
  settings: EntityTable<SettingRecord, 'key'>;
};

db.version(1).stores({
  characters: 'characterId',
  tokens: 'characterId',
  settings: 'key'
});
