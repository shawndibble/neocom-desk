import Dexie, { type EntityTable } from 'dexie';
import type { PlanEntry } from '@/engine/types';
import type { FacilityKind, RigLevel, SecurityBand } from '@/engine/industry/types';
import type { TradeHub } from '@/market/hubs';

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

/** User-editable Skill Plan: an ordered list of skill-level targets. */
export interface SkillPlanRecord {
  id: string;
  characterId: number;
  name: string;
  entries: PlanEntry[];
  /** Remaps the user is willing to spend when optimizing this plan. */
  remapCount: number;
  /**
   * Remap Marker positions in the entry list: position p = "remap before
   * entries[p]" (see features/skills/planner/markers.ts). Optional and
   * additive — not indexed, so no Dexie schema version bump is needed.
   */
  markers?: number[];
  /** Epoch ms of the last edit. */
  updatedAt: number;
}

/**
 * Generic per-character API-derived data cache (skills, attributes, implants,
 * skill queue today; more views later). Never synced — API-derived data is
 * re-pulled per device.
 */
export interface EsiCacheRecord {
  characterId: number;
  key: string;
  value: unknown;
  /** Epoch ms when this value was fetched from ESI. */
  fetchedAt: number;
  /**
   * Paginated list that came back short. Optional because rows written before
   * this existed carry no flag — absent reads as complete, which is what they
   * always claimed to be. Not indexed, so no Dexie version bump.
   */
  truncated?: boolean;
}

/** User-editable Build Plan: manufacturing inputs for one blueprint (CONTEXT.md). */
export interface BuildPlanRecord {
  id: string;
  characterId: number;
  name: string;
  blueprintTypeID: number;
  runs: number;
  /** Blueprint material efficiency, 0..10. */
  me: number;
  /** Blueprint time efficiency, 0..20. */
  te: number;
  facility: FacilityKind;
  rigLevel: RigLevel;
  security: SecurityBand;
  hubId: TradeHub['id'];
  /** Facility tax, percent of EIV. Structures only — NPC station tax is fixed. */
  facilityTaxPct?: number;
  /** Epoch ms of the last edit. */
  updatedAt: number;
}

export const db = new Dexie('neocom') as Dexie & {
  characters: EntityTable<CharacterRecord, 'characterId'>;
  tokens: EntityTable<TokenRecord, 'characterId'>;
  settings: EntityTable<SettingRecord, 'key'>;
  skillPlans: EntityTable<SkillPlanRecord, 'id'>;
  esiCache: Dexie.Table<EsiCacheRecord, [number, string]>;
  buildPlans: EntityTable<BuildPlanRecord, 'id'>;
};

db.version(1).stores({
  characters: 'characterId',
  tokens: 'characterId',
  settings: 'key',
});

// Additive: v1 stores unchanged, plus Skill Plans + the generic ESI cache.
db.version(2).stores({
  characters: 'characterId',
  tokens: 'characterId',
  settings: 'key',
  skillPlans: 'id, characterId',
  esiCache: '[characterId+key]',
});

// Additive: v1/v2 stores unchanged, plus Build Plans.
db.version(3).stores({
  characters: 'characterId',
  tokens: 'characterId',
  settings: 'key',
  skillPlans: 'id, characterId',
  esiCache: '[characterId+key]',
  buildPlans: 'id, characterId',
});
