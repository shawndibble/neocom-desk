import Dexie, { type EntityTable } from 'dexie';
import { emitUpgradeBlocked } from './blockedSignal';
import { esiCacheMetaMiddleware } from './esiCacheMeta';
import type { MailQueueItem } from '@/engine/corpTaxBook/mailQueue';
import type {
  AnsiblexGateRecord,
  ArchiveKind,
  BuildPlanRecord,
  CharacterRecord,
  DynamicItemRecord,
  EsiCacheMetaRecord,
  EsiCacheRecord,
  FittingRecord,
  HullFitCacheRecord,
  IndustryJobHistoryRecord,
  MailDraftRecord,
  MiningLedgerHistoryRecord,
  MiningTaxAssignmentRecord,
  NetWorthSnapshotRecord,
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
  /** Mirror of `esiCache` without the values — see `./esiCacheMeta.ts`. */
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
  orderProblemSamples: EntityTable<OrderProblemSampleRecord, 'orderId'>;
  mailDrafts: EntityTable<MailDraftRecord, 'id'>;
  miningLedgerHistory: EntityTable<MiningLedgerHistoryRecord, 'characterId'>;
  walletJournalArchive: Dexie.Table<WalletJournalArchiveRecord, [number, number]>;
  walletTransactionArchive: Dexie.Table<WalletTransactionArchiveRecord, [number, number]>;
  walletArchiveCoverage: Dexie.Table<WalletArchiveCoverageRecord, [number, ArchiveKind]>;
  industryJobHistory: EntityTable<IndustryJobHistoryRecord, 'characterId'>;
  netWorthSnapshots: EntityTable<NetWorthSnapshotRecord, 'id'>;
  hullFitCache: EntityTable<HullFitCacheRecord, 'key'>;
  ansiblexGates: EntityTable<AnsiblexGateRecord, 'id'>;
  dynamicItems: EntityTable<DynamicItemRecord, 'itemId'>;
  corpMailQueue: EntityTable<MailQueueItem, 'id'>;
};

/**
 * A blocked upgrade is the one Dexie failure with no error path of its own:
 * `req.onblocked` fires this event but never rejects the open, so every read
 * waiting on it stays pending and the app sits on a spinner with nothing
 * thrown and nothing reported.
 *
 * Closing converts it into an ordinary failure. `close()` cancels an in-flight
 * open with `DatabaseClosed`, `useLiveQuery` rethrows that during render, and
 * `ErrorBoundary` already turns a Dexie failure into a recoverable screen with
 * a Reload — the path every one of the 40-plus live queries is behind, rather
 * than only the three gates that render `BootScreen`. One-way by design
 * (`close()` latches `autoOpen: false`), which is why it is tied to this event
 * and not to a timer: a blocked upgrade will not clear itself, but a slow cold
 * start would recover on its own and must never be cut off.
 *
 * The signal fires first — `DatabaseClosed` carries no version numbers, so
 * reporting after the close would lose the diagnosis. It is a signal rather
 * than a Sentry call because `src/db` ships inside the service-worker bundle,
 * which must not carry the React SDK.
 *
 * Another tab *deleting* the database is the other disruption: the app shell
 * reloads on it (`app/databaseWipe.ts`), which a worker has no page to do.
 */
// Keeps `esiCacheMeta` in step with every `esiCache` write and delete, in the
// same transaction. See ./esiCacheMeta.ts.
db.use(esiCacheMetaMiddleware);

db.on('blocked', (event) => {
  emitUpgradeBlocked({ oldVersion: event.oldVersion, newVersion: event.newVersion });
  db.close();
});

// Each version lists only the tables it adds, re-indexes or drops (`null`);
// Dexie carries the rest forward. Never renumber or remove a version.
// `upgradeFromHistory.test.ts` opens every one of them.
db.version(1).stores({
  characters: 'characterId',
  tokens: 'characterId',
  settings: 'key',
});

// Additive: v1 stores unchanged, plus Skill Plans + the generic ESI cache.
db.version(2).stores({
  skillPlans: 'id, characterId',
  esiCache: '[characterId+key]',
});

// Additive: v1/v2 stores unchanged, plus Build Plans.
db.version(3).stores({
  buildPlans: 'id, characterId',
});

// Additive: v1/v2/v3 stores unchanged, plus the Quickbar.
db.version(4).stores({
  quickbars: 'id, characterId',
});

// Additive: v1-v4 stores unchanged, plus Station Pins.
db.version(5).stores({
  stationPins: 'id, characterId, locationId',
});

// Additive: v1-v5 stores unchanged, plus the Notification Feed. `firedAt` is
// indexed so the feed is ordered by the database rather than sorted in JS on
// every read; the table is capped at NOTIFICATION_FEED_LIMIT rows, so reading
// it whole is deliberate.
db.version(6).stores({
  notificationFeed: 'id, characterId, firedAt',
});

// Additive: v1-v6 stores unchanged, plus a `corporationId` index on
// `characters`. No table is added and no row is rewritten — Dexie builds the
// index over what is already there, and records written before the field
// existed simply do not appear in it until their corporation is learned.
db.version(7).stores({
  characters: 'characterId, corporationId',
});

// Additive: v7 stores unchanged, plus the per-planet resource ranking
// (issue #425). Indexed by planetId as well as characterId, because the
// Advisor reads one system's planets at a time.
db.version(8).stores({
  planetRichness: 'id, characterId, planetId',
});

// Additive: v1-v8 stores unchanged, plus Production Runs and their two
// linking-record tables (issue #525). `buildPlanId` is indexed on runs so the
// panel can query one plan's runs directly; `runId` is indexed on both link
// tables so a run's linked sales/watches can be queried without a table scan.
db.version(9).stores({
  productionRuns: 'id, characterId, buildPlanId',
  productionSaleLinks: 'id, characterId, runId',
  productionOrderWatches: 'id, characterId, runId',
});

// Additive: v9 stores unchanged, plus Payees and Mining Tax Assignments
// (issue #523). `miningTaxAssignments` also indexes the compound
// `[characterId+date+solarSystemId]` key — the Mining Ledger Entry identity —
// since every assignment/re-diff read is scoped to one entry at a time.
db.version(10).stores({
  payees: 'id, characterId',
  miningTaxAssignments: 'id, characterId, [characterId+date+solarSystemId]',
});

// Additive: v10 stores unchanged, plus BPC Sourcing watches (issue #926).
// Device-local and character-independent (see `BpcSearchWatchRecord`), so
// unlike every other new table added here it carries no `characterId` index.
db.version(11).stores({
  bpcSearchWatches: 'id',
});

// Additive: v11 stores unchanged, plus per-order `OrderProblem` sample
// histories. Keyed by `orderId` because a series is only ever
// read and written whole; `characterId` is indexed so a prune can be scoped
// to the characters a given load actually saw. Row growth is bounded by
// `engine/market/orderProblemHistory.ts`'s window and per-order cap.
db.version(12).stores({
  orderProblemSamples: 'orderId, characterId',
});

// Additive: v12 stores unchanged, plus Mail Reply/Forward drafts
// (mail-reply-and-forward decision). `characterId` is indexed so
// `removeCharacter` can purge a dropped Character's drafts in one query.
db.version(13).stores({
  mailDrafts: 'id, characterId',
});

// Additive: v13 stores unchanged, plus the Mining Overview's one-year ledger
// history (issue #1278). One row per Character, keyed by it, so
// `removeCharacter` drops it with a single delete.
db.version(14).stores({
  miningLedgerHistory: 'characterId',
});

// Additive: v14 stores unchanged, plus the Mining Overview's saved daily Jita
// buy/sell prices (issue #1279). Keyed by date, so the one-year prune is a
// primary-key range delete.
db.version(15).stores({
  jitaPriceSnapshots: 'date',
});

// Drops BPC Sourcing watches (issue #926), removed as a feature: v15 stores
// unchanged otherwise. Device-local only, so nothing to clean up in sync.
db.version(16).stores({
  bpcSearchWatches: null,
});

// Adds My Fittings (issue #1538): saved Fitting share codes, synced.
db.version(17).stores({
  fittings: 'id, characterId',
});

// Adds the saved hull check for the Fitting editor's module browser: additive,
// device-local, and rebuildable from the engine.
db.version(18).stores({
  hullFitCache: 'key, savedAt',
});

// Adds `esiCacheMeta`, the value-free mirror of `esiCache` that freshness
// checks read (./esiCacheMeta.ts). Additive, and deliberately no `upgrade()`:
// walking `esiCache` to backfill it would deserialize every cached value at
// open, before first render. Rows older than this get meta lazily, on first read.
db.version(19).stores({
  esiCacheMeta: '[characterId+key]',
});

// Adds `ansiblexGates`, Route Safety's device-local Ansiblex list (issue #2478).
// Additive, and never synced.
db.version(20).stores({
  ansiblexGates: 'id',
});

// Adds `industryJobHistory`, delivered industry jobs kept past ESI's window (issue #2866).
// Additive, and never synced.
db.version(21).stores({
  industryJobHistory: 'characterId',
});

// Adds `netWorthSnapshots`, the daily per-Character net worth history (issue #2865).
db.version(22).stores({
  netWorthSnapshots: 'id, characterId',
});

// Adds `productionLosses`, Run Loss records (issue #2851).
db.version(23).stores({
  productionLosses: 'id, characterId, runId',
});

// Adds the wallet journal and transaction archives and their coverage.
db.version(24).stores({
  walletJournalArchive: '[characterId+id], characterId, [characterId+date]',
  walletTransactionArchive: '[characterId+transaction_id], characterId, [characterId+date]',
  walletArchiveCoverage: '[characterId+kind], characterId',
});

// Adds `dynamicItems`, mutated items' rolled attributes from ESI, kept for good.
db.version(25).stores({
  dynamicItems: 'itemId',
});

// Adds `corpMailQueue`, the Corp Tax Book send queue (issue #4064): one row per mail,
// kept so the queue survives closing the tab.
db.version(26).stores({
  corpMailQueue: 'id, corporationId, batchId, senderCharacterId',
});

// Drops `jitaPriceSnapshots`, the Mining Overview's per-browser daily Jita
// prices: the mining pages price every day from the server's Open Prices now
// (decision 20261019-091155). Device-local only, so nothing to clean up in sync.
db.version(27).stores({
  jitaPriceSnapshots: null,
});
