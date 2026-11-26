import type { Table } from 'dexie';
import type {
  BuildPlanRecord,
  db,
  CharacterAcceleratorRecord,
  FittingRecord,
  MiningTaxAssignmentRecord,
  MiningTaxPaymentLinkRecord,
  MiningTaxRecordChangeRecord,
  NetWorthSnapshotRecord,
  PayeeRecord,
  PlanetRichnessRecord,
  ProductionLossRecord,
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
  RemoteMiningTaxPaymentLinkDoc,
  RemoteMiningTaxRecordChangeDoc,
  RemotePayeeDoc,
  RemotePlanDoc,
  RemotePlanetRichnessDoc,
  RemoteCharacterAcceleratorDoc,
  RemoteNetWorthSnapshotDoc,
  RemoteProductionLossDoc,
  RemoteProductionOrderWatchDoc,
  RemoteProductionRunDoc,
  RemoteProductionSaleLinkDoc,
  RemoteQuickbarDoc,
  RemoteStationPinDoc,
  SyncRecord,
} from './merge';

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
  | 'characterAccelerators'
  | 'notificationFeed'
  | 'settings';

export type SyncedCollectionName =
  | 'plans'
  | 'buildPlans'
  | 'quickbars'
  | 'stationPins'
  | 'planetRichness'
  | 'productionRuns'
  | 'productionSaleLinks'
  | 'productionOrderWatches'
  | 'productionLosses'
  | 'netWorthSnapshots'
  | 'characterAccelerators'
  | 'payees'
  | 'fittings'
  | 'miningTaxAssignments'
  | 'miningTaxPaymentLinks'
  | 'miningTaxRecordChanges'
  | 'notificationFeed'
  | 'settings';

export interface EditableRecord extends SyncRecord {
  characterId: number;
}

type Db = typeof db;

type TableOf<L> = {
  [K in keyof Db]: Db[K] extends Table<L, string, unknown> ? K : never;
}[keyof Db];

interface RemoteCollectionBase {
  remoteName: SyncedCollectionName;
  faqItem: SyncedFaqItemId;
}

export interface EditableCollection<
  L extends EditableRecord = EditableRecord,
  R extends RemoteDoc = RemoteDoc,
> extends RemoteCollectionBase {
  kind: 'editable';
  table: TableOf<L> & string;
  tombstoneSegment: string;
  rulesMayLag?: true;
  onRemoval: 'delete' | 'keep';
  toRemoteDoc(local: L, ownerHash: string): Record<string, unknown>;
  toLocalRecord(remote: R): L;
}

export interface FeedOrSettingsCollection extends RemoteCollectionBase {
  kind: 'feed' | 'settings';
}

export type SyncedCollection = EditableCollection | FeedOrSettingsCollection;

function defineEditableCollection<L extends EditableRecord, R extends RemoteDoc>(
  collection: EditableCollection<L, R>
): EditableCollection<L, R> {
  return collection;
}

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
    ...(p.markers !== undefined ? { markers: p.markers } : {}),
    ...(p.markerAttributes !== undefined ? { markerAttributes: p.markerAttributes } : {}),
    ...(p.whatIfImplants !== undefined ? { whatIfImplants: p.whatIfImplants } : {}),
    ...(p.boosters !== undefined
      ? {
          boosters: p.boosters,
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

export const BUILD_PLANS = defineEditableCollection<BuildPlanRecord, RemoteBuildPlanDoc>({
  kind: 'editable',
  remoteName: 'buildPlans',
  table: 'buildPlans',
  tombstoneSegment: 'buildTombstones',
  onRemoval: 'delete',
  faqItem: 'buildPlans',
  toRemoteDoc: (p, ownerHash) => {
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
      rigFit: resolveRigFit(p),
      security: p.security,
      hubId: p.hubId,
      ...(p.buildSystemId !== undefined && p.buildSystemName !== undefined
        ? { buildSystemId: p.buildSystemId, buildSystemName: p.buildSystemName }
        : {}),
      ...(p.buildLocationId !== undefined ? { buildLocationId: p.buildLocationId } : {}),
      ...(p.buildLocationName !== undefined ? { buildLocationName: p.buildLocationName } : {}),
      ...(p.facilityTaxPct !== undefined ? { facilityTaxPct: p.facilityTaxPct } : {}),
      ...(p.costIndexOverridePct !== undefined
        ? { costIndexOverridePct: p.costIndexOverridePct }
        : {}),
      ...(p.materialPriceBasis !== undefined ? { materialPriceBasis: p.materialPriceBasis } : {}),
      ...(p.productSalePrice !== undefined ? { productSalePrice: p.productSalePrice } : {}),
      ...(materialSourcing !== undefined ? { materialSourcing } : {}),
      ...(p.ownedStockScope !== undefined ? { ownedStockScope: p.ownedStockScope } : {}),
      ...(p.includeCorpAssets !== undefined ? { includeCorpAssets: p.includeCorpAssets } : {}),
      ...(p.buildHere !== undefined && p.buildHere.length > 0 ? { buildHere: p.buildHere } : {}),
      ...(p.buildGroupId !== undefined ? { buildGroupId: p.buildGroupId } : {}),
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
    rigFit: resolveRigFit(r),
    security: r.security,
    hubId: r.hubId,
    ...(r.buildSystemId !== undefined && r.buildSystemName !== undefined
      ? { buildSystemId: r.buildSystemId, buildSystemName: r.buildSystemName }
      : {}),
    ...(r.buildLocationId !== undefined ? { buildLocationId: r.buildLocationId } : {}),
    ...(r.buildLocationName !== undefined ? { buildLocationName: r.buildLocationName } : {}),
    ...(r.facilityTaxPct !== undefined ? { facilityTaxPct: r.facilityTaxPct } : {}),
    ...(r.costIndexOverridePct !== undefined
      ? { costIndexOverridePct: r.costIndexOverridePct }
      : {}),
    ...(r.materialPriceBasis !== undefined ? { materialPriceBasis: r.materialPriceBasis } : {}),
    ...(r.productSalePrice !== undefined ? { productSalePrice: r.productSalePrice } : {}),
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

const QUICKBARS = defineEditableCollection<QuickbarRecord, RemoteQuickbarDoc>({
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

export const PRODUCTION_LOSSES = defineEditableCollection<
  ProductionLossRecord,
  RemoteProductionLossDoc
>({
  kind: 'editable',
  remoteName: 'productionLosses',
  table: 'productionLosses',
  tombstoneSegment: 'productionLossTombstones',
  onRemoval: 'delete',
  faqItem: 'productionRuns',
  toRemoteDoc: (r, ownerHash) => ({
    id: r.id,
    characterId: r.characterId,
    runId: r.runId,
    quantity: r.quantity,
    lostAt: r.lostAt,
    insurancePayout: r.insurancePayout,
    ...(r.journalEntryId !== undefined ? { journalEntryId: r.journalEntryId } : {}),
    ...(r.note !== undefined ? { note: r.note } : {}),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    runId: r.runId,
    quantity: r.quantity,
    lostAt: r.lostAt,
    insurancePayout: r.insurancePayout,
    ...(r.journalEntryId !== undefined ? { journalEntryId: r.journalEntryId } : {}),
    ...(r.note !== undefined ? { note: r.note } : {}),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }),
});

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
    ...(p.defaultSystems !== undefined ? { defaultSystems: p.defaultSystems } : {}),
    ...(p.systemId !== undefined ? { systemId: p.systemId } : {}),
    ...(p.hubId !== undefined ? { hubId: p.hubId } : {}),
    ...(p.entityId !== undefined ? { entityId: p.entityId } : {}),
    ...(p.entityKind !== undefined ? { entityKind: p.entityKind } : {}),
    ...(p.archivedAt !== undefined ? { archivedAt: p.archivedAt } : {}),
    updatedAt: p.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    name: r.name,
    defaultTaxPct: r.defaultTaxPct,
    ...(r.defaultSystems !== undefined ? { defaultSystems: r.defaultSystems } : {}),
    ...(r.systemId !== undefined ? { systemId: r.systemId } : {}),
    ...(r.hubId !== undefined ? { hubId: r.hubId } : {}),
    ...(r.entityId !== undefined ? { entityId: r.entityId } : {}),
    ...(r.entityKind !== undefined ? { entityKind: r.entityKind } : {}),
    ...(r.archivedAt !== undefined ? { archivedAt: r.archivedAt } : {}),
    updatedAt: r.updatedAt,
  }),
});

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
    ...(a.releasedTypeIds !== undefined ? { releasedTypeIds: a.releasedTypeIds } : {}),
    ...(a.override !== undefined ? { override: a.override } : {}),
    ...(a.payment !== undefined ? { payment: a.payment } : {}),
    ...(a.oreLineValues !== undefined ? { oreLineValues: a.oreLineValues } : {}),
    ...(a.rawOrePriced !== undefined ? { rawOrePriced: a.rawOrePriced } : {}),
    ...(a.label !== undefined ? { label: a.label } : {}),
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
    ...(r.releasedTypeIds !== undefined ? { releasedTypeIds: r.releasedTypeIds } : {}),
    ...(r.override !== undefined ? { override: r.override } : {}),
    ...(r.payment !== undefined ? { payment: r.payment } : {}),
    ...(r.oreLineValues !== undefined ? { oreLineValues: r.oreLineValues } : {}),
    ...(r.rawOrePriced !== undefined ? { rawOrePriced: r.rawOrePriced } : {}),
    ...(r.label !== undefined ? { label: r.label } : {}),
    updatedAt: r.updatedAt,
  }),
});

export const MINING_TAX_PAYMENT_LINKS = defineEditableCollection<
  MiningTaxPaymentLinkRecord,
  RemoteMiningTaxPaymentLinkDoc
>({
  kind: 'editable',
  remoteName: 'miningTaxPaymentLinks',
  table: 'miningTaxPaymentLinks',
  tombstoneSegment: 'miningTaxPaymentLinkTombstones',
  rulesMayLag: true,
  onRemoval: 'delete',
  faqItem: 'miningTax',
  toRemoteDoc: (l, ownerHash) => ({
    id: l.id,
    characterId: l.characterId,
    payeeId: l.payeeId,
    kind: l.kind,
    refId: l.refId,
    amount: l.amount,
    paidOn: l.paidOn,
    source: l.source,
    ...(l.refs !== undefined ? { refs: l.refs } : {}),
    updatedAt: l.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    payeeId: r.payeeId,
    kind: r.kind,
    refId: r.refId,
    amount: r.amount,
    paidOn: r.paidOn,
    source: r.source,
    ...(r.refs !== undefined ? { refs: r.refs } : {}),
    updatedAt: r.updatedAt,
  }),
});

function recordChangeFields(r: MiningTaxRecordChangeRecord) {
  return {
    id: r.id,
    characterId: r.characterId,
    reason: r.reason,
    at: r.at,
    date: r.date,
    ...(r.corporationId !== undefined ? { corporationId: r.corporationId } : {}),
    ...(r.minerId !== undefined ? { minerId: r.minerId } : {}),
    ...(r.closeOut !== undefined ? { closeOut: r.closeOut } : {}),
    ...(r.assignments !== undefined ? { assignments: r.assignments } : {}),
    updatedAt: r.updatedAt,
  };
}

export const MINING_TAX_RECORD_CHANGES = defineEditableCollection<
  MiningTaxRecordChangeRecord,
  RemoteMiningTaxRecordChangeDoc
>({
  kind: 'editable',
  remoteName: 'miningTaxRecordChanges',
  table: 'miningTaxRecordChanges',
  tombstoneSegment: 'miningTaxRecordChangeTombstones',
  rulesMayLag: true,
  onRemoval: 'delete',
  faqItem: 'miningTax',
  toRemoteDoc: (r, ownerHash) => ({ ...recordChangeFields(r), ownerHash, deleted: false }),
  toLocalRecord: (r) => recordChangeFields(r),
});

const NET_WORTH_SNAPSHOTS = defineEditableCollection<
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
    ...(r.plexValue !== undefined ? { plexValue: r.plexValue } : {}),
    escrow: r.escrow,
    ...(r.sellStock !== undefined ? { sellStock: r.sellStock } : {}),
    ...(r.contractStock !== undefined ? { contractStock: r.contractStock } : {}),
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
    ...(r.plexValue !== undefined ? { plexValue: r.plexValue } : {}),
    escrow: r.escrow,
    ...(r.sellStock !== undefined ? { sellStock: r.sellStock } : {}),
    ...(r.contractStock !== undefined ? { contractStock: r.contractStock } : {}),
    hubId: r.hubId,
    updatedAt: r.updatedAt,
  }),
});

export const CHARACTER_ACCELERATORS = defineEditableCollection<
  CharacterAcceleratorRecord,
  RemoteCharacterAcceleratorDoc
>({
  kind: 'editable',
  remoteName: 'characterAccelerators',
  table: 'characterAccelerators',
  tombstoneSegment: 'characterAcceleratorTombstones',
  onRemoval: 'delete',
  faqItem: 'characterAccelerators',
  toRemoteDoc: (r, ownerHash) => ({
    id: r.id,
    characterId: r.characterId,
    bonus: r.bonus,
    expiresAt: r.expiresAt,
    updatedAt: r.updatedAt,
    ownerHash,
    deleted: false,
  }),
  toLocalRecord: (r) => ({
    id: r.id,
    characterId: r.characterId,
    bonus: r.bonus,
    expiresAt: r.expiresAt,
    updatedAt: r.updatedAt,
  }),
});

export const EDITABLE_COLLECTIONS: readonly EditableCollection[] = [
  SKILL_PLANS,
  BUILD_PLANS,
  QUICKBARS,
  STATION_PINS,
  PLANET_RICHNESS,
  PRODUCTION_RUNS,
  PRODUCTION_SALE_LINKS,
  PRODUCTION_ORDER_WATCHES,
  PRODUCTION_LOSSES,
  NET_WORTH_SNAPSHOTS,
  CHARACTER_ACCELERATORS,
  PAYEES,
  FITTINGS,
  MINING_TAX_ASSIGNMENTS,
  MINING_TAX_PAYMENT_LINKS,
  MINING_TAX_RECORD_CHANGES,
];

export const NOTIFICATION_FEED: FeedOrSettingsCollection = {
  kind: 'feed',
  remoteName: 'notificationFeed',
  faqItem: 'notificationFeed',
};

export const SYNCED_SETTINGS: FeedOrSettingsCollection = {
  kind: 'settings',
  remoteName: 'settings',
  faqItem: 'settings',
};

export const REMOTE_COLLECTIONS: readonly SyncedCollection[] = [
  ...EDITABLE_COLLECTIONS,
  NOTIFICATION_FEED,
  SYNCED_SETTINGS,
];

export const REMOTE_COLLECTION_NAMES: readonly SyncedCollectionName[] = REMOTE_COLLECTIONS.map(
  (c) => c.remoteName
);
