import Dexie, { type EntityTable } from 'dexie';
import type { Implants, PlanEntry } from '@/engine/types';
import type {
  FacilityKind,
  MaterialSourcing,
  RigLevel,
  SecurityBand,
} from '@/engine/industry/types';
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

/**
 * The one-click What-If Implant sets (CONTEXT.md). `+N` is that bonus in
 * every slot; `current` resolves late, against whatever the clone is
 * actually wearing.
 */
export type WhatIfImplantPreset = 'none' | 'current' | '+1' | '+2' | '+3' | '+4' | '+5';

/**
 * A Skill Plan's What-If Implants lens: either one of the uniform presets, or
 * the user's own five per-slot bonuses (EVE's hardwirings are per slot).
 * Behaviour lives in `features/skills/planner/whatIfImplants.ts`; the shape is
 * declared here because it is persisted, like every other record shape in
 * this file.
 *
 * `bonuses` is typed `Implants` (a partial map) because a value read back can
 * be sparse, but every writer emits all five slots — which is what keeps an
 * `undefined` member, the one thing Firestore rejects, out of a pushed doc.
 * `readonly` throughout: `setWhatIfBonus` builds a new selection rather than
 * editing one, and a test pins that.
 */
export type WhatIfImplantSelection =
  | { readonly kind: 'preset'; readonly preset: WhatIfImplantPreset }
  | { readonly kind: 'custom'; readonly bonuses: Implants };

/**
 * A Skill Plan's Booster (CONTEXT.md): the cerebral accelerator the plan is
 * costed under. `expiresAt` is an **instant** (epoch ms), not the
 * `datetime-local` string the input edits — the plan syncs across devices,
 * and a bare wall-clock string would mean a different moment in each
 * timezone. `null` means no expiry has been entered yet, in which case
 * nothing is applied however `enabled` reads.
 */
export interface PlanBooster {
  enabled: boolean;
  /** Uniform per-attribute bonus while the accelerator is live. */
  bonus: number;
  expiresAt: number | null;
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
  /**
   * What-If Implants lens the plan is costed under. Optional and additive —
   * absent means the clone's real implants ('current'), which is how every
   * plan behaved before the lens was persisted at all. Not indexed, so no
   * Dexie schema version bump is needed.
   */
  whatIfImplants?: WhatIfImplantSelection;
  /**
   * Booster the plan is costed under. Optional the same way, and its absence
   * carries meaning beyond "off": a plan that has never had one configured is
   * the only one the editor may prefill from a detected in-game accelerator.
   */
  booster?: PlanBooster;
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
  /**
   * Epoch ms until which this row may be served without a live ESI call,
   * taken from that response's own `Expires` header rather than a guessed
   * constant. Optional and additive like `truncated` — absent means "no
   * freshness window," which is what every row claimed before this existed.
   */
  expiresAt?: number;
}

/** One saved shortcut in the Quickbar (CONTEXT.md). */
export interface QuickbarItem {
  typeId: number;
  name: string;
}

/**
 * User-editable Quickbar: one record per character holding the ordered list
 * of saved item shortcuts (CONTEXT.md). Modelled as a single record, like a
 * Skill Plan's `entries`, rather than one row per item — the whole list edits
 * and merges together, and a flat drag-ordered list needs no per-item id.
 */
export interface QuickbarRecord {
  /** Always String(characterId) — one record per character. */
  id: string;
  characterId: number;
  items: QuickbarItem[];
  /** Epoch ms of the last edit. */
  updatedAt: number;
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
  /**
   * Per-material sourcing overrides, keyed by material typeID: units already
   * owned (free) and/or a manual unit price for the rest. Additive and
   * unindexed, so it needs no schema version bump; a missing key means "buy
   * every unit at the hub", which is how every plan behaved before it existed.
   */
  materialSourcing?: Record<number, MaterialSourcing>;
  /** Epoch ms of the last edit. */
  updatedAt: number;
}

/** A station's pin scope (issue #84). */
export type StationPinScope = 'character' | 'account';

/**
 * User-editable station pin: one record per (characterId, locationId). A
 * `character` pin elevates the station to the top of the list only while that
 * Character is active; an `account` pin elevates it regardless of which
 * Character is active. Account-wide pins have no shared account identity to
 * key off (Account has no storage/sync — CONTEXT.md) so they fan out: one row
 * per Character currently known on this device, each synced under that
 * Character's own ownerHash (see docs/plans/feature-parity/README.md §5.7).
 */
export interface StationPinRecord {
  /** Always `${characterId}:${locationId}` — one record per Character per station. */
  id: string;
  characterId: number;
  locationId: number;
  scope: StationPinScope;
  /** Epoch ms of the last edit. */
  updatedAt: number;
}

/**
 * One notification the Foreground Poller fired, kept so the Overview's
 * Notification Feed can show what was missed (CONTEXT.md round 20). Device-
 * local and never synced, like the preferences that gate it: the poller runs
 * per device, so two devices legitimately hold different feeds.
 *
 * `title`/`body` are stored already rendered rather than re-derived on read —
 * the copy depends on ESI lookups (a skill's name, a planet's) that may not
 * resolve later, and a notification should read the same in the feed as it
 * did on the lock screen.
 *
 * `eventId` is the plain string rather than the feature's `NotificationEventId`
 * union: `src/db` holds no dependency on `src/features` (ARCHITECTURE.md
 * module map), and nothing here needs the narrower type.
 */
export interface NotificationFeedRecord {
  id: string;
  characterId: number;
  eventId: string;
  title: string;
  body: string;
  /** Epoch ms the poller fired this. */
  firedAt: number;
  /**
   * ESI's raw notification `type` string (issue #274), set only for
   * `eventId: 'eveNotification'` rows. Carries the per-type opt-out
   * (`eventSelection.ts`'s `EveTypeEnabledMap`) through to feed-visibility
   * filtering, and doubles as how Settings discovers which types a Character
   * has actually seen — there is no closed catalog to list them from
   * up front (CCP adds types without notice).
   */
  eveType?: string;
}

export const db = new Dexie('neocom') as Dexie & {
  characters: EntityTable<CharacterRecord, 'characterId'>;
  tokens: EntityTable<TokenRecord, 'characterId'>;
  settings: EntityTable<SettingRecord, 'key'>;
  skillPlans: EntityTable<SkillPlanRecord, 'id'>;
  esiCache: Dexie.Table<EsiCacheRecord, [number, string]>;
  buildPlans: EntityTable<BuildPlanRecord, 'id'>;
  quickbars: EntityTable<QuickbarRecord, 'id'>;
  stationPins: EntityTable<StationPinRecord, 'id'>;
  notificationFeed: EntityTable<NotificationFeedRecord, 'id'>;
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

// Additive: v1/v2/v3 stores unchanged, plus the Quickbar.
db.version(4).stores({
  characters: 'characterId',
  tokens: 'characterId',
  settings: 'key',
  skillPlans: 'id, characterId',
  esiCache: '[characterId+key]',
  buildPlans: 'id, characterId',
  quickbars: 'id, characterId',
});

// Additive: v1-v4 stores unchanged, plus Station Pins.
db.version(5).stores({
  characters: 'characterId',
  tokens: 'characterId',
  settings: 'key',
  skillPlans: 'id, characterId',
  esiCache: '[characterId+key]',
  buildPlans: 'id, characterId',
  quickbars: 'id, characterId',
  stationPins: 'id, characterId, locationId',
});

// Additive: v1-v5 stores unchanged, plus the Notification Feed. `firedAt` is
// indexed so the feed is ordered by the database rather than sorted in JS on
// every read; the table is capped at NOTIFICATION_FEED_LIMIT rows, so reading
// it whole is deliberate.
db.version(6).stores({
  characters: 'characterId',
  tokens: 'characterId',
  settings: 'key',
  skillPlans: 'id, characterId',
  esiCache: '[characterId+key]',
  buildPlans: 'id, characterId',
  quickbars: 'id, characterId',
  stationPins: 'id, characterId, locationId',
  notificationFeed: 'id, characterId, firedAt',
});
