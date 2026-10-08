/**
 * Test-only: one record per synced Dexie table with **every** field set.
 * Imported by test files only — nothing in the app references this module
 * (`statusFixtures.ts`'s shape, same reasoning).
 *
 * Each value is typed `Required<...Record>` (Build Plans less the legacy
 * `rigLevel`, explained below), so a field added to a record
 * fails typecheck here until the fixture sets it. The round-trip test
 * (`syncedCollections.test.ts`) then pushes and pulls each one field by field,
 * so a field the collection's remote mapping forgets fails there instead of
 * silently never leaving the device. The backup restore fixture was generated
 * from these same rows.
 */
import type {
  BuildPlanRecord,
  FittingRecord,
  NetWorthSnapshotRecord,
  MiningTaxAssignmentRecord,
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

const UPDATED_AT = 1_790_000_000_000;

export const FULL_SKILL_PLAN: Required<SkillPlanRecord> = {
  id: 'p1',
  characterId: 1,
  name: 'Frigates V',
  entries: [{ skillTypeID: 3327, targetLevel: 5, priority: 'high' }],
  remapCount: 2,
  markers: [1],
  markerAttributes: [{ intelligence: 17, memory: 17, perception: 27, willpower: 21, charisma: 17 }],
  whatIfImplants: { kind: 'preset', preset: '+4' },
  // Identical content on purpose: pushing derives the legacy mirror from
  // boosters[0], so a field-by-field round trip only holds if the fixture
  // already agrees with itself the way a real write would.
  booster: { enabled: true, bonus: 6, startsAt: null, expiresAt: 4_102_444_800_000 },
  boosters: [{ enabled: true, bonus: 6, startsAt: null, expiresAt: 4_102_444_800_000 }],
  milestones: [{ id: 'm1', name: 'Fly Loki', skillTypeID: 3327, level: 5 }],
  updatedAt: UPDATED_AT,
};

// `rigLevel` is the pre-#609 legacy field: this app never writes it any more
// (`rigFit` is what reaches the remote doc — see `resolveRigFit`), so a round
// trip for it no longer happens and it is left out.
export const FULL_BUILD_PLAN: Required<Omit<BuildPlanRecord, 'rigLevel'>> = {
  id: 'b1',
  characterId: 1,
  name: 'Rifter run',
  blueprintTypeID: 638,
  runs: 10,
  me: 10,
  te: 20,
  facility: 'raitaru',
  rigFit: ['meT1', 'teT1', 'none'],
  security: 'highsec',
  hubId: 'jita',
  buildSystemId: 30003888,
  buildSystemName: 'Badivefi',
  buildLocationId: 1035466617946,
  buildLocationName: 'K2-18 R&D',
  facilityTaxPct: 1.5,
  materialPriceBasis: 'buy',
  materialSourcing: { 34: { ownedQuantity: 500, overridePrice: 6.5 } },
  ownedStockScope: {
    mode: 'selected',
    locations: [{ characterId: 1, locationId: 60003760, locationType: 'station' }],
  },
  buildHere: [57478],
  buildGroupId: 'g1',
  includeCorpAssets: true,
  includeReactions: true,
  reactionFacility: 'tatara',
  reactionRigFit: ['meT2', 'teT2', 'none'],
  reactionSecurity: 'lowsec',
  reactionFacilityTaxPct: 2.5,
  reactionBuildSystemId: 30002187,
  reactionBuildSystemName: 'Amamake',
  reactionBuildLocationId: 1035466617947,
  reactionBuildLocationName: 'Amamake Reactor',
  updatedAt: UPDATED_AT,
};

export const FULL_QUICKBAR: Required<QuickbarRecord> = {
  id: '1',
  characterId: 1,
  items: [{ typeId: 34, name: 'Tritanium', targetPrice: 4.5, targetDirection: 'below' }],
  updatedAt: UPDATED_AT,
};

export const FULL_STATION_PIN: Required<StationPinRecord> = {
  id: '1:60003760',
  characterId: 1,
  locationId: 60003760,
  scope: 'account',
  updatedAt: UPDATED_AT,
};

export const FULL_PLANET_RICHNESS: Required<PlanetRichnessRecord> = {
  id: '1:40000001',
  characterId: 1,
  planetId: 40000001,
  order: [2268, 2305],
  updatedAt: UPDATED_AT,
};

export const FULL_PRODUCTION_RUN: Required<ProductionRunRecord> = {
  id: 'run1',
  characterId: 1,
  buildPlanId: 'b1',
  productTypeID: 587,
  quantity: 10,
  materialCost: 1_000_000,
  jobFee: 25_000,
  totalCost: 1_025_000,
  loggedAt: UPDATED_AT - 5000,
  updatedAt: UPDATED_AT,
  sourceJobId: 987654,
};

export const FULL_PRODUCTION_SALE_LINK: Required<ProductionSaleLinkRecord> = {
  id: '1:txn:555',
  characterId: 1,
  runId: 'run1',
  transactionId: 555,
  quantity: 4,
  unitPrice: 150_000,
  linkedAt: UPDATED_AT - 4000,
  updatedAt: UPDATED_AT,
};

export const FULL_PRODUCTION_ORDER_WATCH: Required<ProductionOrderWatchRecord> = {
  id: '1:order:777',
  characterId: 1,
  runId: 'run1',
  orderId: 777,
  unitPrice: 160_000,
  initialVolumeRemain: 6,
  lastKnownVolumeRemain: 3,
  closed: false,
  watchedAt: UPDATED_AT - 3000,
  updatedAt: UPDATED_AT,
};

export const FULL_PRODUCTION_LOSS: Required<ProductionLossRecord> = {
  id: '1:loss:555',
  characterId: 1,
  runId: 'run1',
  quantity: 5,
  lostAt: UPDATED_AT - 4000,
  insurancePayout: 1_500_000,
  journalEntryId: 555,
  note: 'Gank at Uedama',
  createdAt: UPDATED_AT - 3000,
  updatedAt: UPDATED_AT,
};

export const FULL_PAYEE: Required<PayeeRecord> = {
  id: 'payee1',
  characterId: 1,
  name: 'Moon Corp',
  defaultTaxPct: 10,
  systemId: 30000142,
  hubId: 'amarr',
  entityId: 98000001,
  updatedAt: UPDATED_AT,
};

export const FULL_FITTING: Required<FittingRecord> = {
  id: 'fit1',
  characterId: 1,
  name: 'Brawler Rifter',
  code: 'eyJ2IjoxfQ',
  // Non-empty on purpose: "no notes" travels as '' and comes back absent.
  notes: 'Overheat the guns',
  updatedAt: UPDATED_AT,
};

export const FULL_MINING_TAX_ASSIGNMENT: Required<MiningTaxAssignmentRecord> = {
  id: 'mta1',
  characterId: 1,
  date: '2026-09-04',
  solarSystemId: 30000142,
  payeeId: 'payee1',
  oreLines: [{ typeId: 45490, quantity: 1000 }],
  taxPct: 10,
  estimatedValue: 5_000_000,
  taxOwed: 500_000,
  status: 'paid',
  reviewDiff: [{ typeId: 45490, before: 900, after: 1000 }],
  paidAt: UPDATED_AT - 1000,
  groupId: 'grp1',
  collectsGrowth: true,
  payment: {
    paymentId: 'pay1',
    paidOn: '2026-09-05',
    method: 'contract',
    amount: 500_000,
    journalLinks: [{ refId: 123, source: 'auto' }],
    contractLinks: [{ refId: 456, source: 'manual' }],
  },
  oreLineValues: { 45490: 4_800_000 },
  rawOrePriced: true,
  updatedAt: UPDATED_AT,
};

export const FULL_NET_WORTH_SNAPSHOT: Required<NetWorthSnapshotRecord> = {
  id: '1:2026-10-07',
  characterId: 1,
  day: '2026-10-07',
  wallet: 1_500_000_000,
  assetValue: 42_000_000_000,
  plexValue: 3_000_000_000,
  escrow: 250_000_000,
  sellStock: 800_000_000,
  hubId: 'jita',
  updatedAt: UPDATED_AT,
};

/** One full record per synced Dexie table, keyed by table name. */
export const FULL_RECORDS = {
  skillPlans: FULL_SKILL_PLAN,
  buildPlans: FULL_BUILD_PLAN,
  quickbars: FULL_QUICKBAR,
  stationPins: FULL_STATION_PIN,
  planetRichness: FULL_PLANET_RICHNESS,
  productionRuns: FULL_PRODUCTION_RUN,
  productionSaleLinks: FULL_PRODUCTION_SALE_LINK,
  productionOrderWatches: FULL_PRODUCTION_ORDER_WATCH,
  productionLosses: FULL_PRODUCTION_LOSS,
  netWorthSnapshots: FULL_NET_WORTH_SNAPSHOT,
  payees: FULL_PAYEE,
  fittings: FULL_FITTING,
  miningTaxAssignments: FULL_MINING_TAX_ASSIGNMENT,
} as const;
