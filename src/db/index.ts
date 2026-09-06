import Dexie, { type EntityTable } from 'dexie';
import type { Attributes, Implants, PlanEntry } from '@/engine/types';
import type {
  FacilityKind,
  MaterialPriceBasis,
  MaterialSourcing,
  OwnedStockScope,
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
  /**
   * The corporation the character last read as belonging to. Learned from
   * `/characters/{id}/` (`stores/publicInfo.ts`), never from the SSO JWT,
   * which does not carry it.
   *
   * The reason it is persisted at all is that a *change* here revokes consent
   * for corp-owned cache rows (`auth/session.recordCharacterCorporation`) —
   * without a stored prior there is nothing to compare against, so a pilot who
   * changes corp would go on reading the old corp's data.
   *
   * Optional, and absent means "not yet learned", never "corporation 0": a
   * device upgrading from v6 has records that predate the field, and an
   * unknown prior is not a corp change. Indexed from v7 — the one thing in
   * this file that needed a version bump rather than riding along unindexed.
   */
  corporationId?: number;
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
   * Manual target-attribute overrides for markers, set via the Remap Marker
   * modal. Addressed by the same ordinal as `markers` once normalized
   * (`features/skills/planner/markers.ts`'s `normalizeMarkerAttributes`), not
   * by position — `null` marks "no override" (the marker shows whatever
   * "Optimize at my markers" last computed for it, if anything). Optional and
   * additive, like `markers` itself — absent means no marker has ever been
   * edited manually, and every writer emits a dense array so an
   * `undefined` element (which Firestore rejects) never appears.
   */
  markerAttributes?: (Attributes | null)[];
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
  /**
   * Solar system the job runs in, which is what the job fee's cost index is
   * charged at. Absent means the hub's own system — how every plan behaved
   * before this existed, and still right for a player who builds where they
   * sell. Additive and unindexed, so no schema version bump (see
   * `materialSourcing` below).
   */
  buildSystemId?: number;
  /**
   * ESI's name for `buildSystemId`, stored so the results panel can label the
   * index without a lookup. The two are one fact and are always written
   * together: a plan holding one without the other builds at its hub, because
   * a fee charged at one system under another system's label is worse than no
   * build system at all.
   */
  buildSystemName?: string;
  /**
   * The station or structure the pilot picked in the build location search,
   * kept so the search box can still name it after a reload instead of going
   * blank the moment the pick fills the fields below it.
   *
   * Held for the label only — every calculation still reads `facility`,
   * `security` and `buildSystemId`, which the pick wrote. That makes a stale
   * pair a wrong *label*, never a wrong number, and the two manual controls
   * that could make it stale (the Facility select, the Build system field)
   * clear both fields as they edit.
   *
   * Unlike `buildSystemId`/`buildSystemName` these two are independently
   * optional: ESI withholds a structure's name from a Character whose role
   * cannot see it, and the id is still worth keeping — the label that stands
   * in for the missing name is UI copy (`buildLocationLabel.ts`), not data.
   * Additive and unindexed, so no schema version bump.
   */
  buildLocationId?: number;
  /** @see buildLocationId */
  buildLocationName?: string;
  /** Facility tax, percent of EIV. Structures only — NPC station tax is fixed. */
  facilityTaxPct?: number;
  /**
   * Which side of the hub's order book this plan's materials are bought at:
   * `'sell'` (fill the lowest sell orders, pay now) or `'buy'` (place buy
   * orders and wait). Additive and unindexed, so no schema version bump —
   * same as `materialSourcing` below. Absent means `'sell'`, which is how
   * every plan priced materials before this existed.
   *
   * Materials only. The product is always valued at the hub's lowest sell,
   * because an Acquisition Verdict asks what buying it outright costs.
   */
  materialPriceBasis?: MaterialPriceBasis;
  /**
   * Per-material sourcing overrides, keyed by material typeID: units already
   * owned (free) and/or a manual unit price for the rest. Additive and
   * unindexed, so it needs no schema version bump; a missing key means "buy
   * every unit at the hub", which is how every plan behaved before it existed.
   */
  materialSourcing?: Record<number, MaterialSourcing>;
  /**
   * Which locations count toward this plan's "use detected" owned-stock
   * totals: every placement (absent, or `{ mode: 'everywhere' }`, the
   * default and today's only behavior before this existed) or only a chosen
   * subset (`{ mode: 'selected' }`). Additive and unindexed, same as
   * `materialSourcing` above — no schema version bump needed.
   */
  ownedStockScope?: OwnedStockScope;
  /**
   * Material typeIDs the player chose to produce rather than buy, one level
   * deep: each one is replaced in the materials table and the shopping list by
   * the inputs its own job consumes. Manufacturing only — a planetary material
   * listed here is ignored, since its inputs are grown, not installed.
   *
   * Additive and unindexed, same as `materialSourcing` above — no schema
   * version bump needed. Absent means "buy every material", which is how every
   * plan behaved before this existed.
   */
  buildHere?: number[];
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
 * A pilot's own best-to-worst ranking of the P0 resources on one planet
 * (issue #425, CONTEXT.md round 51/52).
 *
 * ESI carries no per-planet resource richness at all, and the in-game scan
 * overlay shows a colour map rather than a number — so an ordering is the only
 * honest thing a pilot can record, and a percentage would be invention. The
 * ranking is knowledge they paid probe time for, which is why it is synced
 * Editable Data rather than a device-local preference.
 *
 * Account-wide, and account-wide is the *only* scope: a planet's richness is a
 * property of the planet, identical for every Character in the account, so
 * there is no per-Character reading to offer and nothing to elevate. Unlike
 * `StationPinRecord` it therefore carries no `scope` field — it fans out to
 * every Character the same way, one row each, synced under that Character's
 * own ownerHash (round 7, parity plan §5.7).
 */
export interface PlanetRichnessRecord {
  /** Always `${characterId}:${planetId}` — one record per Character per planet. */
  id: string;
  characterId: number;
  planetId: number;
  /**
   * P0 typeIDs, richest first. Only the resources that planet type actually
   * yields, and a resource the pilot has not ranked is simply absent rather
   * than sorted to the end — "I have not scanned this" and "this is worst"
   * are different claims.
   */
  order: number[];
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
  /**
   * Epoch ms the row was dismissed, absent while live. A flag rather than a
   * delete: this collection carries no tombstones, so a device that comes
   * back after `sync/merge.ts`'s 30-day TTL edge can't resurrect a row that
   * would have been a delete's tombstone (CONTEXT.md round 45, issue #361).
   * A row written before this field existed has no `dismissedAt` and is
   * treated as not dismissed.
   */
  dismissedAt?: number;
}

/**
 * A Payee (CONTEXT.md, issue #523): who the Moon Mining Tax ledger owes —
 * user-managed, per-character (like `BuildPlanRecord`). The moon/system tag
 * is what lets a future entry auto-suggest this Payee and its rate — "pick
 * the moon, the corp, or the person, whichever is memorable" — and is
 * deliberately left unmatched for the two-corps-one-system-one-day case,
 * which the Assignment's own split-line support handles instead.
 */
export interface PayeeRecord {
  id: string;
  characterId: number;
  name: string;
  /** Percent, 0-100. What a new Assignment against this Payee prefills. */
  defaultTaxPct: number;
  /** Solar system id this Payee collects on, for auto-match. Optional — a Payee need not be tied to one system. */
  systemId?: number;
  /**
   * The EVE character or corporation id this Payee *is* — the recipient of the
   * ISK, so a donation or contract already sent can be matched back to what it
   * paid off (issue #540). Never asked for up front: a Payee is a free-text
   * label ("pick the moon, the corp, or the person, whichever is memorable"),
   * and a field almost nobody would fill in is worse than none. It is learned
   * instead, the first time a payment to that recipient is confirmed as
   * settling this Payee's entries.
   */
  entityId?: number;
  /** Epoch ms of the last edit. */
  updatedAt: number;
}

/** One ore line an Assignment covers — a whole Mining Ledger Entry, or a split slice of one (two Payees, one system, one day). */
export interface MiningTaxOreLine {
  typeId: number;
  quantity: number;
}

/** Before/after quantity for one ore type, recorded when a `needs-review` flip occurs (CONTEXT.md, issue #523). */
export interface MiningTaxQuantityDiff {
  typeId: number;
  before: number;
  after: number;
}

export type MiningTaxAssignmentStatus = 'outstanding' | 'paid' | 'needs-review' | 'dismissed';

/**
 * An Assignment (CONTEXT.md, issue #523): links a Mining Ledger Entry (or a
 * split slice of its ore lines) to a Payee, snapshotting the tax percent and
 * ISK value **at assignment time** — invoice semantics, so neither a later
 * Jita price move nor an edited Payee default retroactively changes what an
 * already-assigned obligation shows as owed. Both the value and the tax
 * percent are prefilled from the computed default but pilot-editable at
 * assignment time, since Jita price and a Payee's default rate are both
 * estimates that can be wrong for a specific haul.
 *
 * A `dismissed` Assignment ("I don't pay tax on this entry") carries no
 * `payeeId` — there is no Payee to owe, so `taxPct`/`taxOwed` are always 0.
 * It still snapshots `oreLines` and still participates in re-diffing (a
 * dismissed entry that grows still surfaces for reconsideration, the same as
 * a paid one).
 *
 * Re-diffed on every ledger refresh: if ESI reports *more* ore for the same
 * (characterId, date, solarSystemId) after assignment, `status` flips to
 * `needs-review` and `reviewDiff` records the before/after — never silently
 * absorbed into `oreLines`.
 */
export interface MiningTaxAssignmentRecord {
  id: string;
  /** The character who mined this — the Mining Ledger Entry's own owner. */
  characterId: number;
  /** EVE/UTC calendar date, e.g. "2026-09-04". */
  date: string;
  solarSystemId: number;
  /** Absent only when `status` is `dismissed` — every other status owes a real Payee. */
  payeeId?: string;
  /** The ore lines this Assignment covers, snapshotted at assignment time. */
  oreLines: MiningTaxOreLine[];
  /** Percent, 0-100, snapshotted from the Payee's default (or overridden) at assignment time. Always 0 for `dismissed`. */
  taxPct: number;
  /** ISK value of `oreLines` at Jita price, snapshotted at assignment time — pilot-editable at assignment. */
  estimatedValue: number;
  /** Snapshotted at assignment time — defaults to `estimatedValue * taxPct / 100` but is pilot-editable. Always 0 for `dismissed`. */
  taxOwed: number;
  status: MiningTaxAssignmentStatus;
  /** Set only while `status` is `needs-review`. */
  reviewDiff?: MiningTaxQuantityDiff[];
  /** Epoch ms the assignment was marked paid, absent while outstanding or needs-review. */
  paidAt?: number;
  /**
   * Shared by every Assignment joined into one combined ledger row (issue
   * #523's "join entries" feature — a moon-mining session that spans
   * midnight UTC, so ESI reports it as two Mining Ledger Entries the corp's
   * own billing treats as one). Every member always shares `characterId` and
   * `solarSystemId` (a Payee is scoped to one character, and a join is
   * same-system-only) — never assume a group can span either. A `groupId`
   * shared by only one surviving record (the other member deleted, or a sync
   * race delivering one member before the other) renders as an ordinary
   * ungrouped row rather than a broken group of one.
   */
  groupId?: string;
  /**
   * Which Assignment on a split entry (2+ covering one character/day/system)
   * receives any ore ESI reports for that day *after* the split — one EVE/UTC
   * day can hold two local-time sessions at two corps' moons in one system,
   * so the later one's ore has to have exactly one owner
   * (`engine/miningTax/ownership.ts`). Meaningless, and never set, on a sole
   * Assignment: it always collects.
   */
  collectsGrowth?: boolean;
  /**
   * How this Assignment was settled, when it was marked paid through the
   * Settle-up flow rather than a bare "mark paid". Every Assignment covered
   * by one lump-sum payment shares a `paymentId`, so a per-Payee payment
   * history is a group-by away without a separate synced table.
   */
  payment?: MiningTaxPaymentInfo;
  /** Epoch ms of the last edit. */
  updatedAt: number;
}

export type MiningTaxPaymentMethod = 'donation' | 'contract' | 'other';

export interface MiningTaxPaymentInfo {
  /** Shared by every Assignment settled in the same lump sum. */
  paymentId: string;
  /** Local calendar date the pilot says they paid, `YYYY-MM-DD` — a real-world date, not an EVE ledger date. */
  paidOn: string;
  method: MiningTaxPaymentMethod;
  /** The whole lump sum, in ISK — the same figure on every Assignment it covered. */
  amount: number;
  /** Wallet journal entry id (`WalletJournalEntry.id`) the pilot linked this payment to, if any. */
  journalRefId?: number;
  /** Contract id the pilot typed or linked, if any. */
  contractId?: number;
}

/**
 * A manually logged Production Run (issue #525, CONTEXT.md): a snapshot of
 * one production batch off a Build Plan — materials cost, job fee, and
 * quantity as they stood at logging time, user-overridable and never
 * re-derived afterward. Exists to answer "what did this batch actually cost
 * and actually sell for", which a Build Plan's own live-recomputed
 * `BuildResult` cannot: that number moves with the market and blueprint
 * inputs on every render, and a realized-profit figure has to hold still
 * against the price the pilot actually paid.
 *
 * Deliberately holds no list of linked sales — see `ProductionSaleLinkRecord`
 * and `ProductionOrderWatchRecord` below for why each linked sale is its own
 * record rather than a field on this one.
 */
export interface ProductionRunRecord {
  id: string;
  characterId: number;
  buildPlanId: string;
  productTypeID: number;
  /** Units produced by this run. */
  quantity: number;
  materialCost: number;
  jobFee: number;
  totalCost: number;
  /** Epoch ms the run was logged. */
  loggedAt: number;
  /** Epoch ms of the last edit. */
  updatedAt: number;
}

/**
 * One past wallet sale linked to a Production Run's output ("Link Past
 * Sale", issue #525) — a picker over the character's already-cached
 * `WalletTransaction[]` (`features/character/wallet.ts`), never a new ESI
 * surface.
 *
 * One record per linked transaction, not an array field on
 * `ProductionRunRecord`: `sync/merge.ts` is last-write-wins per whole
 * document, so two devices linking *different* sales to the same run before
 * syncing would have one allocation silently overwrite the other if they
 * shared a document. Giving each link its own record, keyed deterministically
 * off ESI's own `transaction_id` (`${characterId}:txn:${transactionId}`,
 * `sync/planSync.ts`), makes that race structurally impossible instead of
 * merely handled: two devices linking different sales write two different
 * documents, and the deterministic id makes the same sale linked twice on
 * two devices collide into one document rather than double-count. Mirrors
 * the Notification Feed's Occurrence Key precedent (CONTEXT.md).
 *
 * `transactionId` is absent for a "Manual / Private Sale" entry — a sale the
 * pilot recorded by hand for a disposal ESI has no record of at all (gifted,
 * sold in a private deal, reprocessed and sold as something else). Its id is
 * `${characterId}:manual:${crypto.randomUUID()}` instead of a deterministic
 * transaction id, since there is no natural ESI id to key uniqueness off —
 * a manual entry has no cross-device double-count risk to begin with, since
 * nothing else could ever independently produce the same one.
 */
export interface ProductionSaleLinkRecord {
  /** `${characterId}:txn:${transactionId}` for a linked sale, `${characterId}:manual:${uuid}` for a manual one. */
  id: string;
  characterId: number;
  runId: string;
  /** Absent for a manual entry — see the type doc above. */
  transactionId?: number;
  quantity: number;
  unitPrice: number;
  /** Epoch ms the pilot linked this sale. */
  linkedAt: number;
  /** Epoch ms of the last edit. */
  updatedAt: number;
}

/**
 * One of the character's own open sell orders, watched for fills against a
 * Production Run's output ("Watch Open Order", issue #525) — tracks
 * `volume_remain` directly rather than a wallet-transaction lookup, so it
 * can't age out of ESI's rolling wallet-transaction window the way a
 * historical sale can.
 *
 * Same one-record-per-allocation shape as `ProductionSaleLinkRecord`, and for
 * the same reason: keyed deterministically off ESI's own `order_id`
 * (`${characterId}:order:${orderId}`).
 *
 * There is no background poller for orders — `lastKnownVolumeRemain` only
 * moves when the pilot refreshes the Production Runs panel
 * (`engine/industry/orderWatch.ts`'s `computeOrderFillQuantity` does the
 * diffing). `closed` is set once the order no longer appears among the
 * character's open orders (fully filled, cancelled, or expired) — realized
 * quantity is only ever the confirmed drop in `volume_remain` up to that
 * point, never extrapolated from disappearance, since a cancelled order
 * would otherwise be counted as a sale it never made.
 */
export interface ProductionOrderWatchRecord {
  /** Always `${characterId}:order:${orderId}` — see the type doc above. */
  id: string;
  characterId: number;
  runId: string;
  orderId: number;
  unitPrice: number;
  initialVolumeRemain: number;
  lastKnownVolumeRemain: number;
  /** True once the order no longer appears among the character's open orders. */
  closed: boolean;
  /** Epoch ms the watch was created. */
  watchedAt: number;
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
  quickbars: EntityTable<QuickbarRecord, 'id'>;
  stationPins: EntityTable<StationPinRecord, 'id'>;
  planetRichness: EntityTable<PlanetRichnessRecord, 'id'>;
  notificationFeed: EntityTable<NotificationFeedRecord, 'id'>;
  productionRuns: EntityTable<ProductionRunRecord, 'id'>;
  productionSaleLinks: EntityTable<ProductionSaleLinkRecord, 'id'>;
  productionOrderWatches: EntityTable<ProductionOrderWatchRecord, 'id'>;
  payees: EntityTable<PayeeRecord, 'id'>;
  miningTaxAssignments: EntityTable<MiningTaxAssignmentRecord, 'id'>;
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

// Additive: v1-v6 stores unchanged, plus a `corporationId` index on
// `characters`. No table is added and no row is rewritten — Dexie builds the
// index over what is already there, and records written before the field
// existed simply do not appear in it until their corporation is learned.
db.version(7).stores({
  characters: 'characterId, corporationId',
  tokens: 'characterId',
  settings: 'key',
  skillPlans: 'id, characterId',
  esiCache: '[characterId+key]',
  buildPlans: 'id, characterId',
  quickbars: 'id, characterId',
  stationPins: 'id, characterId, locationId',
  notificationFeed: 'id, characterId, firedAt',
});

// Additive: v7 stores unchanged, plus the per-planet resource ranking
// (issue #425). Indexed by planetId as well as characterId, because the
// Advisor reads one system's planets at a time.
db.version(8).stores({
  characters: 'characterId, corporationId',
  tokens: 'characterId',
  settings: 'key',
  skillPlans: 'id, characterId',
  esiCache: '[characterId+key]',
  buildPlans: 'id, characterId',
  quickbars: 'id, characterId',
  stationPins: 'id, characterId, locationId',
  planetRichness: 'id, characterId, planetId',
  notificationFeed: 'id, characterId, firedAt',
});

// Additive: v1-v8 stores unchanged, plus Production Runs and their two
// linking-record tables (issue #525). `buildPlanId` is indexed on runs so the
// panel can query one plan's runs directly; `runId` is indexed on both link
// tables so a run's linked sales/watches can be queried without a table scan.
db.version(9).stores({
  characters: 'characterId, corporationId',
  tokens: 'characterId',
  settings: 'key',
  skillPlans: 'id, characterId',
  esiCache: '[characterId+key]',
  buildPlans: 'id, characterId',
  quickbars: 'id, characterId',
  stationPins: 'id, characterId, locationId',
  planetRichness: 'id, characterId, planetId',
  notificationFeed: 'id, characterId, firedAt',
  productionRuns: 'id, characterId, buildPlanId',
  productionSaleLinks: 'id, characterId, runId',
  productionOrderWatches: 'id, characterId, runId',
});

// Additive: v9 stores unchanged, plus Payees and Mining Tax Assignments
// (issue #523). `miningTaxAssignments` also indexes the compound
// `[characterId+date+solarSystemId]` key — the Mining Ledger Entry identity —
// since every assignment/re-diff read is scoped to one entry at a time.
db.version(10).stores({
  characters: 'characterId, corporationId',
  tokens: 'characterId',
  settings: 'key',
  skillPlans: 'id, characterId',
  esiCache: '[characterId+key]',
  buildPlans: 'id, characterId',
  quickbars: 'id, characterId',
  stationPins: 'id, characterId, locationId',
  planetRichness: 'id, characterId, planetId',
  notificationFeed: 'id, characterId, firedAt',
  productionRuns: 'id, characterId, buildPlanId',
  productionSaleLinks: 'id, characterId, runId',
  productionOrderWatches: 'id, characterId, runId',
  payees: 'id, characterId',
  miningTaxAssignments: 'id, characterId, [characterId+date+solarSystemId]',
});
