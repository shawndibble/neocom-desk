import Dexie, { type EntityTable } from 'dexie';
import { emitUpgradeBlocked } from './blockedSignal';
import { esiCacheMetaMiddleware } from './esiCacheMeta';
import type { MailQueueItem } from '@/engine/corpTaxBook/mailQueue';
import type {
  CorpBookObservedMetaRecord,
  CorpBookObservedRecord,
  CorpBookPartRecord,
  RouteSnapshotRecord,
  AnsiblexGateRecord,
  ArchiveKind,
  BuildPlanRecord,
  CharacterRecord,
  ContractArchiveRecord,
  ContractItemArchiveRecord,
  DynamicItemRecord,
  EsiCacheMetaRecord,
  EsiCacheRecord,
  FittingRecord,
  HullFitCacheRecord,
  IndustryJobHistoryRecord,
  MailDraftRecord,
  MiningLedgerHistoryRecord,
  MiningTaxAssignmentRecord,
  MiningTaxPaymentLinkRecord,
  MiningTaxRecordChangeRecord,
  NetWorthSnapshotRecord,
  CharacterAcceleratorRecord,
  NotificationFeedRecord,
  OrderProblemSampleRecord,
  PayeeRecord,
  PlanetRichnessRecord,
  ProductionLossRecord,
  ProductionOrderWatchRecord,
  ProductionRunRecord,
  ProductionSaleLinkRecord,
  QuickbarRecord,
  SettingRecord,
  SkillPlanRecord,
  StationPinRecord,
  TokenRecord,
  WalletArchiveCoverageRecord,
  WalletJournalArchiveRecord,
  WalletTransactionArchiveRecord,
} from './records';

export * from './records';

export const db = new Dexie('neocom') as Dexie & {
  characters: EntityTable<CharacterRecord, 'characterId'>;
  tokens: EntityTable<TokenRecord, 'characterId'>;
  settings: EntityTable<SettingRecord, 'key'>;
  skillPlans: EntityTable<SkillPlanRecord, 'id'>;
  esiCache: Dexie.Table<EsiCacheRecord, [number, string]>;
  esiCacheMeta: Dexie.Table<EsiCacheMetaRecord, [number, string]>;
  buildPlans: EntityTable<BuildPlanRecord, 'id'>;
  quickbars: EntityTable<QuickbarRecord, 'id'>;
  stationPins: EntityTable<StationPinRecord, 'id'>;
  planetRichness: EntityTable<PlanetRichnessRecord, 'id'>;
  notificationFeed: EntityTable<NotificationFeedRecord, 'id'>;
  productionRuns: EntityTable<ProductionRunRecord, 'id'>;
  productionSaleLinks: EntityTable<ProductionSaleLinkRecord, 'id'>;
  productionOrderWatches: EntityTable<ProductionOrderWatchRecord, 'id'>;
  productionLosses: EntityTable<ProductionLossRecord, 'id'>;
  payees: EntityTable<PayeeRecord, 'id'>;
  fittings: EntityTable<FittingRecord, 'id'>;
  miningTaxAssignments: EntityTable<MiningTaxAssignmentRecord, 'id'>;
  miningTaxPaymentLinks: EntityTable<MiningTaxPaymentLinkRecord, 'id'>;
  miningTaxRecordChanges: EntityTable<MiningTaxRecordChangeRecord, 'id'>;
  orderProblemSamples: EntityTable<OrderProblemSampleRecord, 'orderId'>;
  mailDrafts: EntityTable<MailDraftRecord, 'id'>;
  miningLedgerHistory: EntityTable<MiningLedgerHistoryRecord, 'characterId'>;
  walletJournalArchive: Dexie.Table<WalletJournalArchiveRecord, [number, number]>;
  walletTransactionArchive: Dexie.Table<WalletTransactionArchiveRecord, [number, number]>;
  walletArchiveCoverage: Dexie.Table<WalletArchiveCoverageRecord, [number, ArchiveKind]>;
  contractArchive: Dexie.Table<ContractArchiveRecord, [number, number]>;
  contractItemArchive: Dexie.Table<ContractItemArchiveRecord, [number, number]>;
  industryJobHistory: EntityTable<IndustryJobHistoryRecord, 'characterId'>;
  netWorthSnapshots: EntityTable<NetWorthSnapshotRecord, 'id'>;
  characterAccelerators: EntityTable<CharacterAcceleratorRecord, 'id'>;
  hullFitCache: EntityTable<HullFitCacheRecord, 'key'>;
  ansiblexGates: EntityTable<AnsiblexGateRecord, 'id'>;
  dynamicItems: EntityTable<DynamicItemRecord, 'itemId'>;
  corpMailQueue: EntityTable<MailQueueItem, 'id'>;
  corpBookObserved: Dexie.Table<CorpBookObservedRecord, [number, number, string]>;
  corpBookObservedMeta: Dexie.Table<CorpBookObservedMetaRecord, [number, number]>;
  corpBookParts: Dexie.Table<CorpBookPartRecord, [number, number, string]>;
  routeSnapshots: Dexie.Table<RouteSnapshotRecord, [number, string]>;
};

db.use(esiCacheMetaMiddleware);

db.on('blocked', (event) => {
  emitUpgradeBlocked({ oldVersion: event.oldVersion, newVersion: event.newVersion });
  db.close();
});

db.version(1).stores({
  characters: 'characterId',
  tokens: 'characterId',
  settings: 'key',
});

db.version(2).stores({
  skillPlans: 'id, characterId',
  esiCache: '[characterId+key]',
});

db.version(3).stores({
  buildPlans: 'id, characterId',
});

db.version(4).stores({
  quickbars: 'id, characterId',
});

db.version(5).stores({
  stationPins: 'id, characterId, locationId',
});

db.version(6).stores({
  notificationFeed: 'id, characterId, firedAt',
});

db.version(7).stores({
  characters: 'characterId, corporationId',
});

db.version(8).stores({
  planetRichness: 'id, characterId, planetId',
});

db.version(9).stores({
  productionRuns: 'id, characterId, buildPlanId',
  productionSaleLinks: 'id, characterId, runId',
  productionOrderWatches: 'id, characterId, runId',
});

db.version(10).stores({
  payees: 'id, characterId',
  miningTaxAssignments: 'id, characterId, [characterId+date+solarSystemId]',
});

db.version(11).stores({
  bpcSearchWatches: 'id',
});

db.version(12).stores({
  orderProblemSamples: 'orderId, characterId',
});

db.version(13).stores({
  mailDrafts: 'id, characterId',
});

db.version(14).stores({
  miningLedgerHistory: 'characterId',
});

db.version(15).stores({
  jitaPriceSnapshots: 'date',
});

db.version(16).stores({
  bpcSearchWatches: null,
});

db.version(17).stores({
  fittings: 'id, characterId',
});

db.version(18).stores({
  hullFitCache: 'key, savedAt',
});

db.version(19).stores({
  esiCacheMeta: '[characterId+key]',
});

db.version(20).stores({
  ansiblexGates: 'id',
});

db.version(21).stores({
  industryJobHistory: 'characterId',
});

db.version(22).stores({
  netWorthSnapshots: 'id, characterId',
});

db.version(23).stores({
  productionLosses: 'id, characterId, runId',
});

db.version(24).stores({
  walletJournalArchive: '[characterId+id], characterId, [characterId+date]',
  walletTransactionArchive: '[characterId+transaction_id], characterId, [characterId+date]',
  walletArchiveCoverage: '[characterId+kind], characterId',
});

db.version(25).stores({
  dynamicItems: 'itemId',
});

db.version(26).stores({
  corpMailQueue: 'id, corporationId, batchId, senderCharacterId',
});

db.version(27).stores({
  jitaPriceSnapshots: null,
});

db.version(28).stores({
  corpBookObserved: '[characterId+corporationId+id], [characterId+corporationId], characterId',
  corpBookObservedMeta: '[characterId+corporationId], characterId',
});

db.version(29).stores({
  corpBookParts: '[characterId+corporationId+slot], [characterId+corporationId], characterId',
});

db.version(30).stores({
  routeSnapshots: '[characterId+name], characterId',
});

db.version(31).stores({
  contractArchive: '[characterId+contract_id], characterId, [characterId+archiveDate]',
  contractItemArchive: '[characterId+contract_id], characterId',
});

db.version(32).stores({
  characterAccelerators: 'id, characterId',
});

db.version(33).stores({
  corpMailQueue: 'id, corporationId, batchId, senderCharacterId, order, statementId',
  netWorthSnapshots: 'id, characterId, [characterId+day]',
});

db.version(34).stores({
  miningTaxPaymentLinks: 'id, characterId, payeeId',
});

db.version(35).stores({
  miningTaxRecordChanges: 'id, characterId, corporationId',
});
