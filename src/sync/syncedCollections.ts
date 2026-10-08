// The synced collection registry (issue #2043): one declaration per
// collection that leaves this device for Firestore under
// /characters/{uid}/{remoteName}, in the style of `esi/registry.ts`'s
// ESI_REGISTRY and the Notification Event Entries.
//
// Every per-collection list the app used to keep by hand derives from here:
// the sync pass and the ownerHash-change wipe (planSync.ts), the tombstone
// keys and their cleanup (localBookkeeping.ts), the local delete on Character removal
// (features/character/removeCharacter.ts), the tables an encrypted device
// backup carries (backup/io.ts), and the "What We Store" commitment
// (features/faq/whatWeStore.ts).
//
// Pure declaration: no Firebase and no Dexie *runtime* import, so every one of
// those — including the Firebase-free ones kept off the ~160 KB Firebase
// chunk (see index.ts) — can import it synchronously. Consumers reach a
// declaration's Dexie table through `db.table(collection.table)`.
//
// Adding a collection here is not the whole job. `firestore.rules` and
// `firestore.indexes.json` stay hand-written and deployed by hand;
// `syncedCollections.test.ts` fails until both cover the new collection.
// A new Dexie table still needs its own new `db.version()` block.

import type { Table } from 'dexie';
import type {
  BuildPlanRecord,
  db,
  FittingRecord,
  MiningTaxAssignmentRecord,
  NetWorthSnapshotRecord,
  PayeeRecord,
  PlanetRichnessRecord,
  ProductionOrderWatchRecord,
  ProductionRunRecord,
  ProductionSaleLinkRecord,
  QuickbarRecord,
  SkillPlanRecord,
  StationPinRecord,
} from '@/db';
import { normalizeMaterialSourcingMap } from '@/engine/industry/sourcing';
import { resolveRigFit } from '@/engine/industry/types';
import type {
  RemoteBuildPlanDoc,
  RemoteDoc,
  RemoteFittingDoc,
  RemoteMiningTaxAssignmentDoc,
  RemotePayeeDoc,
  RemotePlanDoc,
  RemotePlanetRichnessDoc,
  RemoteNetWorthSnapshotDoc,
  RemoteProductionOrderWatchDoc,
  RemoteProductionRunDoc,
  RemoteProductionSaleLinkDoc,
  RemoteQuickbarDoc,
  RemoteStationPinDoc,
  SyncRecord,
} from './merge';

/**
 * The "What We Store" line (features/faq/whatWeStore.ts) that tells the pilot
 * about a collection. Several collections share one line on purpose — a
 * reader wants "Production Runs, and the sales and orders you linked to
 * them", not three bullets.
 */
export type SyncedFaqItemId =
  | 'skillPlans'
  | 'buildPlans'
  | 'productionRuns'
  | 'quickbar'
  | 'stationPins'
  | 'piPicks'
  | 'miningTax'
  | 'fittings'
  | 'netWorthSnapshots'
  | 'notificationFeed'
  | 'settings';

/** Minimum shape of a row in an editable collection's Dexie table. */
export interface EditableRecord extends SyncRecord {
  characterId: number;
}

type Db = typeof db;

/** Dexie tables whose rows are `L` — so a declaration cannot name the wrong table. */
type TableOf<L> = {
  [K in keyof Db]: Db[K] extends Table<L, string, unknown> ? K : never;
}[keyof Db];

interface RemoteCollectionBase {
  /**
   * Firestore subcollection under /characters/{uid}. Byte-identical to what
   * is already stored and to its `firestore.rules` block — never rename.
   */
  remoteName: string;
  faqItem: SyncedFaqItemId;
}

/**
 * One piece of Editable Data (CONTEXT.md) synced record-by-record:
 * last-write-wins per id, deletions carried by tombstones (merge.ts).
 *
 * Mappings are method signatures on purpose, so a typed declaration can sit
 * in the erased {@link EDITABLE_COLLECTIONS} list.
 */
export interface EditableCollection<
  L extends EditableRecord = EditableRecord,
  R extends RemoteDoc = RemoteDoc,
> extends RemoteCollectionBase {
  kind: 'editable';
  /** Dexie table holding this collection's rows. */
  table: TableOf<L> & string;
  /**
   * Device-local tombstone list key segment: `sync.__<segment>.<characterId>`
   * (`localBookkeeping.tombstoneKey`). Pinned verbatim — tombstones already
   * on a device are read back under exactly this key, and the older ones do
   * not follow a pattern (`plans` is plain `tombstones`).
   */
  tombstoneSegment: string;
  /**
   * What removing a Character (features/character/removeCharacter.ts) does
   * to this table's local rows. A change of owner (planSync's
   * handleOwnerHashChange) always wipes every editable collection.
   */
  onRemoval: 'delete' | 'keep';
  /** Full remote doc payload for a local record (explicit field list — never spread). */
  toRemoteDoc(local: L, ownerHash: string): Record<string, unknown>;
  /** Local record from a remote doc, stripping remote-only fields. */
  toLocalRecord(remote: R): L;
}

/** A remote collection that does not sync through the editable-record merge. */
export interface FeedOrSettingsCollection extends RemoteCollectionBase {
  /**
   * `feed`: the Notification Feed — no tombstones, merged on dismissal
   * (planSync's syncFeed). `settings`: the synced settings allow-list, one
   * global set with its own tombstones (planSync's syncCharacter).
   */
  kind: 'feed' | 'settings';
}

export type SyncedCollection = EditableCollection | FeedOrSettingsCollection;

/** Identity helper: exists only to check a declaration against its record type. */
function defineEditableCollection<L extends EditableRecord, R extends RemoteDoc>(
  collection: EditableCollection<L, R>
): EditableCollection<L, R> {
  return collection;
}

/** Skill Plans. */
export const SKILL_PLANS = defineEditableCollection<SkillPlanRecord, RemotePlanDoc>({
  kind: 'editable',
  remoteName: 'plans',
  table: 'skillPlans',
  tombstoneSegment: 'tombstones',
  onRemoval: 'delete',
  faqItem: 'skillPlans',
  toRemoteDoc: (p, ownerHash) => ({
    id: p.id,
    characterId: p.characterId,
    name: p.name,
    entries: p.entries,
    remapCount: p.remapCount,
    // Firestore rejects undefined values, so optional fields are omitted.
    ...(p.markers !== undefined ? { markers: p.markers } : {}),
    ...(p.markerAttributes !== undefined ? { markerAttributes: p.markerAttributes } : {}),
    // The lenses the plan is costed under (What-If Implants, Booster) are
    // part of the plan, not a per-device view preference, so they travel
    // with it. Same omit-when-absent rule; a Booster's own `expiresAt` is
    // `number | null`, and null is a value Firestore stores happily.
    ...(p.whatIfImplants !== undefined ? { whatIfImplants: p.whatIfImplants } : {}),
    ...(p.boosters !== undefined
      ? {
          boosters: p.boosters,
          // Legacy compat for one release (#1407): a device still on the
          // single-Booster build reads only `booster`. An empty list is
          // itself an answer ("no accelerators"), so it writes a disabled
          // row rather than omitting the key — omitting it would let an
          // older build's own prefill logic re-arm.
          booster: p.boosters[0] ?? { enabled: false, bonus: 0, startsAt: null, expiresAt: null },
        }
      : p.booster !== undefined
        ? { booster: p.booster }
        : {}),
    ...(p.milestones !== undefined ? { milestones: p.milestones } : {}),
    updatedAt: p.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    name: r.name,
    entries: r.entries,
    remapCount: r.remapCount,
    ...(r.markers !== undefined ? { markers: r.markers } : {}),
    ...(r.markerAttributes !== undefined ? { markerAttributes: r.markerAttributes } : {}),
    ...(r.whatIfImplants !== undefined ? { whatIfImplants: r.whatIfImplants } : {}),
    ...(r.booster !== undefined ? { booster: r.booster } : {}),
    ...(r.boosters !== undefined ? { boosters: r.boosters } : {}),
    ...(r.milestones !== undefined ? { milestones: r.milestones } : {}),
    updatedAt: r.updatedAt,
  }),
});

/** Build Plans. */
export const BUILD_PLANS = defineEditableCollection<BuildPlanRecord, RemoteBuildPlanDoc>({
  kind: 'editable',
  remoteName: 'buildPlans',
  table: 'buildPlans',
  tombstoneSegment: 'buildTombstones',
  onRemoval: 'delete',
  faqItem: 'buildPlans',
  toRemoteDoc: (p, ownerHash) => {
    // Firestore rejects undefined at any depth, so the map is normalized (empty
    // and undefined-valued entries dropped) before it can reach a setDoc.
    const materialSourcing = normalizeMaterialSourcingMap(p.materialSourcing);
    return {
      id: p.id,
      characterId: p.characterId,
      name: p.name,
      blueprintTypeID: p.blueprintTypeID,
      runs: p.runs,
      me: p.me,
      te: p.te,
      facility: p.facility,
      // Always the normalized fit, never the legacy `rigLevel` — a self-heal
      // that means a record pushed by this build is never behind a device
      // still reading the pre-#609 shape only, and repeated pushes converge
      // on one shape even if the local record still carries stale `rigLevel`.
      rigFit: resolveRigFit(p),
      security: p.security,
      hubId: p.hubId,
      // One fact, routed as one pair: the id is what the fee is charged at and
      // the name is what labels it, so a half-pair would label the cost index
      // with a system it was not charged at. A half-pair syncs as neither,
      // which falls the plan back to its hub — wrong, but not lying.
      ...(p.buildSystemId !== undefined && p.buildSystemName !== undefined
        ? { buildSystemId: p.buildSystemId, buildSystemName: p.buildSystemName }
        : {}),
      // Independent, unlike the system pair above: an id whose name ESI
      // withheld still travels, and the picker composes the stand-in label.
      ...(p.buildLocationId !== undefined ? { buildLocationId: p.buildLocationId } : {}),
      ...(p.buildLocationName !== undefined ? { buildLocationName: p.buildLocationName } : {}),
      ...(p.facilityTaxPct !== undefined ? { facilityTaxPct: p.facilityTaxPct } : {}),
      ...(p.materialPriceBasis !== undefined ? { materialPriceBasis: p.materialPriceBasis } : {}),
      ...(materialSourcing !== undefined ? { materialSourcing } : {}),
      ...(p.ownedStockScope !== undefined ? { ownedStockScope: p.ownedStockScope } : {}),
      ...(p.includeCorpAssets !== undefined ? { includeCorpAssets: p.includeCorpAssets } : {}),
      // An empty selection is omitted rather than pushed as [], so a plan that
      // expanded a row and collapsed it again is byte-identical to one that
      // never did — the same rule materialSourcing follows above.
      ...(p.buildHere !== undefined && p.buildHere.length > 0 ? { buildHere: p.buildHere } : {}),
      // Build Group membership (issue #626). Easy to forget and impossible to
      // notice: `RemoteBuildPlanDoc` derives from `BuildPlanRecord`, so a new
      // field appears on the remote type for free and omitting it here
      // compiles clean — while being silently dropped on push *and* pull.
      // planSync.test.ts's `fullBuildPlan` is `Required<BuildPlanRecord>` and
      // its key list is pinned, so a new field fails there until it is routed
      // here deliberately.
      ...(p.buildGroupId !== undefined ? { buildGroupId: p.buildGroupId } : {}),
      // Include Reactions / Reaction Location (issue #698) — same
      // present-or-omitted convention as the plan's own location fields
      // above, and the same buildSystemId/Name pairing rule, since the
      // Reaction Location mirrors the primary location one-for-one.
      ...(p.includeReactions !== undefined ? { includeReactions: p.includeReactions } : {}),
      ...(p.reactionFacility !== undefined ? { reactionFacility: p.reactionFacility } : {}),
      ...(p.reactionRigFit !== undefined ? { reactionRigFit: p.reactionRigFit } : {}),
      ...(p.reactionSecurity !== undefined ? { reactionSecurity: p.reactionSecurity } : {}),
      ...(p.reactionFacilityTaxPct !== undefined
        ? { reactionFacilityTaxPct: p.reactionFacilityTaxPct }
        : {}),
      ...(p.reactionBuildSystemId !== undefined && p.reactionBuildSystemName !== undefined
        ? {
            reactionBuildSystemId: p.reactionBuildSystemId,
            reactionBuildSystemName: p.reactionBuildSystemName,
          }
        : {}),
      ...(p.reactionBuildLocationId !== undefined
        ? { reactionBuildLocationId: p.reactionBuildLocationId }
        : {}),
      ...(p.reactionBuildLocationName !== undefined
        ? { reactionBuildLocationName: p.reactionBuildLocationName }
        : {}),
      updatedAt: p.updatedAt,
      ownerHash,
      deleted: false,
    };
  },
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    name: r.name,
    blueprintTypeID: r.blueprintTypeID,
    runs: r.runs,
    me: r.me,
    te: r.te,
    facility: r.facility,
    // Migrates a remote doc from an older device that still only carries the
    // legacy `rigLevel` (see the analogous note in `toRemoteDoc` above).
    rigFit: resolveRigFit(r),
    security: r.security,
    hubId: r.hubId,
    ...(r.buildSystemId !== undefined && r.buildSystemName !== undefined
      ? { buildSystemId: r.buildSystemId, buildSystemName: r.buildSystemName }
      : {}),
    ...(r.buildLocationId !== undefined ? { buildLocationId: r.buildLocationId } : {}),
    ...(r.buildLocationName !== undefined ? { buildLocationName: r.buildLocationName } : {}),
    ...(r.facilityTaxPct !== undefined ? { facilityTaxPct: r.facilityTaxPct } : {}),
    ...(r.materialPriceBasis !== undefined ? { materialPriceBasis: r.materialPriceBasis } : {}),
    ...(r.materialSourcing !== undefined ? { materialSourcing: r.materialSourcing } : {}),
    ...(r.ownedStockScope !== undefined ? { ownedStockScope: r.ownedStockScope } : {}),
    ...(r.includeCorpAssets !== undefined ? { includeCorpAssets: r.includeCorpAssets } : {}),
    ...(r.buildHere !== undefined ? { buildHere: r.buildHere } : {}),
    ...(r.buildGroupId !== undefined ? { buildGroupId: r.buildGroupId } : {}),
    ...(r.includeReactions !== undefined ? { includeReactions: r.includeReactions } : {}),
    ...(r.reactionFacility !== undefined ? { reactionFacility: r.reactionFacility } : {}),
    ...(r.reactionRigFit !== undefined ? { reactionRigFit: r.reactionRigFit } : {}),
    ...(r.reactionSecurity !== undefined ? { reactionSecurity: r.reactionSecurity } : {}),
    ...(r.reactionFacilityTaxPct !== undefined
      ? { reactionFacilityTaxPct: r.reactionFacilityTaxPct }
      : {}),
    ...(r.reactionBuildSystemId !== undefined && r.reactionBuildSystemName !== undefined
      ? {
          reactionBuildSystemId: r.reactionBuildSystemId,
          reactionBuildSystemName: r.reactionBuildSystemName,
        }
      : {}),
    ...(r.reactionBuildLocationId !== undefined
      ? { reactionBuildLocationId: r.reactionBuildLocationId }
      : {}),
    ...(r.reactionBuildLocationName !== undefined
      ? { reactionBuildLocationName: r.reactionBuildLocationName }
      : {}),
    updatedAt: r.updatedAt,
  }),
});

/** The Quickbar: one record per Character, never deleted (only emptied), so its tombstone list stays empty in practice — kept because every editable collection syncs through the same tombstone-aware merge. */
export const QUICKBARS = defineEditableCollection<QuickbarRecord, RemoteQuickbarDoc>({
  kind: 'editable',
  remoteName: 'quickbars',
  table: 'quickbars',
  tombstoneSegment: 'quickbarTombstones',
  onRemoval: 'delete',
  faqItem: 'quickbar',
  toRemoteDoc: (q, ownerHash) => ({
    id: q.id,
    characterId: q.characterId,
    items: q.items,
    updatedAt: q.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    items: r.items,
    updatedAt: r.updatedAt,
  }),
});

/** Station Pins (issue #84). Account-wide rows fan out one per Character — see `planSync.setAccountStationPin`. */
export const STATION_PINS = defineEditableCollection<StationPinRecord, RemoteStationPinDoc>({
  kind: 'editable',
  remoteName: 'stationPins',
  table: 'stationPins',
  tombstoneSegment: 'stationPinTombstones',
  onRemoval: 'delete',
  faqItem: 'stationPins',
  toRemoteDoc: (p, ownerHash) => ({
    id: p.id,
    characterId: p.characterId,
    locationId: p.locationId,
    scope: p.scope,
    updatedAt: p.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    locationId: r.locationId,
    scope: r.scope,
    updatedAt: r.updatedAt,
  }),
});

/** A planet's resource ranking (issue #425), account-wide by fan-out. */
export const PLANET_RICHNESS = defineEditableCollection<
  PlanetRichnessRecord,
  RemotePlanetRichnessDoc
>({
  kind: 'editable',
  remoteName: 'planetRichness',
  table: 'planetRichness',
  tombstoneSegment: 'planetRichnessTombstones',
  onRemoval: 'delete',
  faqItem: 'piPicks',
  toRemoteDoc: (row, ownerHash) => ({
    id: row.id,
    characterId: row.characterId,
    planetId: row.planetId,
    order: row.order,
    updatedAt: row.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    planetId: r.planetId,
    order: r.order,
    updatedAt: r.updatedAt,
  }),
});

/** A logged Production Run (issue #525): a locked financial snapshot. */
export const PRODUCTION_RUNS = defineEditableCollection<
  ProductionRunRecord,
  RemoteProductionRunDoc
>({
  kind: 'editable',
  remoteName: 'productionRuns',
  table: 'productionRuns',
  tombstoneSegment: 'productionRunTombstones',
  onRemoval: 'delete',
  faqItem: 'productionRuns',
  toRemoteDoc: (r, ownerHash) => ({
    id: r.id,
    characterId: r.characterId,
    buildPlanId: r.buildPlanId,
    productTypeID: r.productTypeID,
    quantity: r.quantity,
    materialCost: r.materialCost,
    jobFee: r.jobFee,
    totalCost: r.totalCost,
    loggedAt: r.loggedAt,
    updatedAt: r.updatedAt,
    ...(r.sourceJobId !== undefined && { sourceJobId: r.sourceJobId }),
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    buildPlanId: r.buildPlanId,
    productTypeID: r.productTypeID,
    quantity: r.quantity,
    materialCost: r.materialCost,
    jobFee: r.jobFee,
    totalCost: r.totalCost,
    loggedAt: r.loggedAt,
    updatedAt: r.updatedAt,
    ...(r.sourceJobId !== undefined && { sourceJobId: r.sourceJobId }),
  }),
});

/** One past sale linked to a Production Run (issue #525) — its own document, so two devices linking different sales never collide. */
export const PRODUCTION_SALE_LINKS = defineEditableCollection<
  ProductionSaleLinkRecord,
  RemoteProductionSaleLinkDoc
>({
  kind: 'editable',
  remoteName: 'productionSaleLinks',
  table: 'productionSaleLinks',
  tombstoneSegment: 'productionSaleLinkTombstones',
  onRemoval: 'delete',
  faqItem: 'productionRuns',
  toRemoteDoc: (r, ownerHash) => ({
    id: r.id,
    characterId: r.characterId,
    runId: r.runId,
    // Firestore rejects undefined values, so a manual entry's absent
    // transactionId is omitted rather than sent as null.
    ...(r.transactionId !== undefined ? { transactionId: r.transactionId } : {}),
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    linkedAt: r.linkedAt,
    updatedAt: r.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    runId: r.runId,
    ...(r.transactionId !== undefined ? { transactionId: r.transactionId } : {}),
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    linkedAt: r.linkedAt,
    updatedAt: r.updatedAt,
  }),
});

/** One open sell order watched for a Production Run (issue #525) — its own document, like a sale link. */
export const PRODUCTION_ORDER_WATCHES = defineEditableCollection<
  ProductionOrderWatchRecord,
  RemoteProductionOrderWatchDoc
>({
  kind: 'editable',
  remoteName: 'productionOrderWatches',
  table: 'productionOrderWatches',
  tombstoneSegment: 'productionOrderWatchTombstones',
  onRemoval: 'delete',
  faqItem: 'productionRuns',
  toRemoteDoc: (r, ownerHash) => ({
    id: r.id,
    characterId: r.characterId,
    runId: r.runId,
    orderId: r.orderId,
    unitPrice: r.unitPrice,
    initialVolumeRemain: r.initialVolumeRemain,
    lastKnownVolumeRemain: r.lastKnownVolumeRemain,
    closed: r.closed,
    watchedAt: r.watchedAt,
    updatedAt: r.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    runId: r.runId,
    orderId: r.orderId,
    unitPrice: r.unitPrice,
    initialVolumeRemain: r.initialVolumeRemain,
    lastKnownVolumeRemain: r.lastKnownVolumeRemain,
    closed: r.closed,
    watchedAt: r.watchedAt,
    updatedAt: r.updatedAt,
  }),
});

/** Moon Mining Tax Payees (issue #523). */
export const PAYEES = defineEditableCollection<PayeeRecord, RemotePayeeDoc>({
  kind: 'editable',
  remoteName: 'payees',
  table: 'payees',
  tombstoneSegment: 'payeeTombstones',
  onRemoval: 'delete',
  faqItem: 'miningTax',
  toRemoteDoc: (p, ownerHash) => ({
    id: p.id,
    characterId: p.characterId,
    name: p.name,
    defaultTaxPct: p.defaultTaxPct,
    ...(p.systemId !== undefined ? { systemId: p.systemId } : {}),
    ...(p.hubId !== undefined ? { hubId: p.hubId } : {}),
    ...(p.entityId !== undefined ? { entityId: p.entityId } : {}),
    updatedAt: p.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    name: r.name,
    defaultTaxPct: r.defaultTaxPct,
    ...(r.systemId !== undefined ? { systemId: r.systemId } : {}),
    ...(r.hubId !== undefined ? { hubId: r.hubId } : {}),
    ...(r.entityId !== undefined ? { entityId: r.entityId } : {}),
    updatedAt: r.updatedAt,
  }),
});

/** My Fittings (issue #1538). */
export const FITTINGS = defineEditableCollection<FittingRecord, RemoteFittingDoc>({
  kind: 'editable',
  remoteName: 'fittings',
  table: 'fittings',
  tombstoneSegment: 'fittingTombstones',
  onRemoval: 'delete',
  faqItem: 'fittings',
  toRemoteDoc: (f, ownerHash) => ({
    id: f.id,
    characterId: f.characterId,
    name: f.name,
    code: f.code,
    // Firestore rejects `undefined`, so "no notes" travels as an empty string.
    notes: f.notes ?? '',
    updatedAt: f.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    name: r.name,
    code: r.code,
    ...(r.notes ? { notes: r.notes } : {}),
    updatedAt: r.updatedAt,
  }),
});

/** Moon Mining Tax Assignments (issue #523). */
export const MINING_TAX_ASSIGNMENTS = defineEditableCollection<
  MiningTaxAssignmentRecord,
  RemoteMiningTaxAssignmentDoc
>({
  kind: 'editable',
  remoteName: 'miningTaxAssignments',
  table: 'miningTaxAssignments',
  tombstoneSegment: 'miningTaxAssignmentTombstones',
  onRemoval: 'delete',
  faqItem: 'miningTax',
  toRemoteDoc: (a, ownerHash) => ({
    id: a.id,
    characterId: a.characterId,
    date: a.date,
    solarSystemId: a.solarSystemId,
    ...(a.payeeId !== undefined ? { payeeId: a.payeeId } : {}),
    oreLines: a.oreLines,
    taxPct: a.taxPct,
    estimatedValue: a.estimatedValue,
    taxOwed: a.taxOwed,
    status: a.status,
    ...(a.reviewDiff !== undefined ? { reviewDiff: a.reviewDiff } : {}),
    ...(a.paidAt !== undefined ? { paidAt: a.paidAt } : {}),
    ...(a.groupId !== undefined ? { groupId: a.groupId } : {}),
    ...(a.collectsGrowth !== undefined ? { collectsGrowth: a.collectsGrowth } : {}),
    ...(a.payment !== undefined ? { payment: a.payment } : {}),
    ...(a.oreLineValues !== undefined ? { oreLineValues: a.oreLineValues } : {}),
    ...(a.rawOrePriced !== undefined ? { rawOrePriced: a.rawOrePriced } : {}),
    updatedAt: a.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    date: r.date,
    solarSystemId: r.solarSystemId,
    ...(r.payeeId !== undefined ? { payeeId: r.payeeId } : {}),
    oreLines: r.oreLines,
    taxPct: r.taxPct,
    estimatedValue: r.estimatedValue,
    taxOwed: r.taxOwed,
    status: r.status,
    ...(r.reviewDiff !== undefined ? { reviewDiff: r.reviewDiff } : {}),
    ...(r.paidAt !== undefined ? { paidAt: r.paidAt } : {}),
    ...(r.groupId !== undefined ? { groupId: r.groupId } : {}),
    ...(r.collectsGrowth !== undefined ? { collectsGrowth: r.collectsGrowth } : {}),
    ...(r.payment !== undefined ? { payment: r.payment } : {}),
    ...(r.oreLineValues !== undefined ? { oreLineValues: r.oreLineValues } : {}),
    ...(r.rawOrePriced !== undefined ? { rawOrePriced: r.rawOrePriced } : {}),
    updatedAt: r.updatedAt,
  }),
});

/** One Character's net worth on one UTC day (issue #2865) — numbers only, one document per day. */
export const NET_WORTH_SNAPSHOTS = defineEditableCollection<
  NetWorthSnapshotRecord,
  RemoteNetWorthSnapshotDoc
>({
  kind: 'editable',
  remoteName: 'netWorthSnapshots',
  table: 'netWorthSnapshots',
  tombstoneSegment: 'netWorthSnapshotTombstones',
  onRemoval: 'delete',
  faqItem: 'netWorthSnapshots',
  toRemoteDoc: (r, ownerHash) => ({
    id: r.id,
    characterId: r.characterId,
    day: r.day,
    wallet: r.wallet,
    assetValue: r.assetValue,
    plexValue: r.plexValue,
    escrow: r.escrow,
    ...(r.sellStock !== undefined ? { sellStock: r.sellStock } : {}),
    hubId: r.hubId,
    updatedAt: r.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    day: r.day,
    wallet: r.wallet,
    assetValue: r.assetValue,
    plexValue: r.plexValue,
    escrow: r.escrow,
    ...(r.sellStock !== undefined ? { sellStock: r.sellStock } : {}),
    hubId: r.hubId,
    updatedAt: r.updatedAt,
  }),
});

/**
 * Every editable collection, **in sync order**: syncCharacter walks this list
 * one collection at a time and a throw stops the pass, so the order is
 * behavior.
 */
export const EDITABLE_COLLECTIONS: readonly EditableCollection[] = [
  SKILL_PLANS,
  BUILD_PLANS,
  QUICKBARS,
  STATION_PINS,
  PLANET_RICHNESS,
  PRODUCTION_RUNS,
  PRODUCTION_SALE_LINKS,
  PRODUCTION_ORDER_WATCHES,
  NET_WORTH_SNAPSHOTS,
  PAYEES,
  FITTINGS,
  MINING_TAX_ASSIGNMENTS,
];

/** The Notification Feed's remote copy (issue #362). Device-local archive, synced window only. */
export const NOTIFICATION_FEED: FeedOrSettingsCollection = {
  kind: 'feed',
  remoteName: 'notificationFeed',
  faqItem: 'notificationFeed',
};

/** Synced settings: the `sync.`-prefixed keys on `syncedSettings.ts`'s allow-list. */
export const SYNCED_SETTINGS: FeedOrSettingsCollection = {
  kind: 'settings',
  remoteName: 'settings',
  faqItem: 'settings',
};

/**
 * Every collection a Character owns remotely — the authoritative answer to
 * "what leaves this device" (the "What We Store" section is a promise to the
 * pilot about exactly this set).
 */
export const REMOTE_COLLECTIONS: readonly SyncedCollection[] = [
  ...EDITABLE_COLLECTIONS,
  NOTIFICATION_FEED,
  SYNCED_SETTINGS,
];

export const REMOTE_COLLECTION_NAMES: readonly string[] = REMOTE_COLLECTIONS.map(
  (c) => c.remoteName
);
