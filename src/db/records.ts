import type { ComposeRecipientType } from '@/engine/mail/mailCompose';
import type { CachedPage, EsiCacheMetaRecord } from './esiCacheMeta';
import type { Attributes, Implants, PlanEntry, PlanMilestone } from '@/engine/types';
import type {
  FacilityKind,
  MaterialPriceBasis,
  MaterialSourcing,
  OwnedStockScope,
  RigFit,
  RigLevel,
  SecurityBand,
} from '@/engine/industry/types';
import type { TradeHub } from '@/market/hubs';
import type { OrderProblemSample } from '@/engine/market/orderProblemHistory';
import type { MiningLedgerRow } from '@/engine/miningTax/types';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import type {
  AssignmentChange,
  RecordChangeReason,
  ToleranceCloseOut,
} from '@/engine/miningTax/recordChanges';
import type {
  Contract,
  ContractItem,
  IndustryJob,
  WalletJournalEntry,
  WalletTransaction,
} from '@/esi/endpoints';

export interface CharacterRecord {
  characterId: number;
  name: string;
  ownerHash: string;
  addedAt: number;
  corporationId?: number;
}

export interface TokenRecord {
  characterId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export type WhatIfImplantPreset = 'none' | 'current' | '+1' | '+2' | '+3' | '+4' | '+5';

export type WhatIfImplantSelection =
  | { readonly kind: 'preset'; readonly preset: WhatIfImplantPreset }
  | { readonly kind: 'custom'; readonly bonuses: Implants };

export interface PlanBooster {
  enabled: boolean;
  bonus: number;
  startsAt: number | null;
  expiresAt: number | null;
}

export interface SkillPlanRecord {
  id: string;
  characterId: number;
  name: string;
  entries: PlanEntry[];
  remapCount: number;
  markers?: number[];
  markerAttributes?: (Attributes | null)[];
  whatIfImplants?: WhatIfImplantSelection;
  booster?: PlanBooster;
  boosters?: PlanBooster[];
  milestones?: PlanMilestone[];
  updatedAt: number;
}

export interface EsiCacheRecord {
  characterId: number;
  key: string;
  value: unknown;
  fetchedAt: number;
  truncated?: boolean;
  expiresAt?: number;
  etag?: string;
  pages?: CachedPage[];
}

export type { CachedPage, EsiCacheMetaRecord };

export interface QuickbarItem {
  typeId: number;
  name: string;
  targetPrice?: number;
  targetDirection?: 'above' | 'below';
}

export interface QuickbarRecord {
  id: string;
  characterId: number;
  items: QuickbarItem[];
  updatedAt: number;
}

export interface BuildPlanRecord {
  id: string;
  characterId: number;
  name: string;
  blueprintTypeID: number;
  runs: number;
  me: number;
  te: number;
  facility: FacilityKind;
  rigFit?: RigFit;
  rigLevel?: RigLevel;
  security: SecurityBand;
  hubId: TradeHub['id'];
  buildSystemId?: number;
  buildSystemName?: string;
  buildLocationId?: number;
  buildLocationName?: string;
  facilityTaxPct?: number;
  costIndexOverridePct?: number;
  materialPriceBasis?: MaterialPriceBasis;
  productSalePrice?: number;
  materialSourcing?: Record<number, MaterialSourcing>;
  ownedStockScope?: OwnedStockScope;
  includeCorpAssets?: boolean;
  buildHere?: number[];
  buildGroupId?: string;
  includeReactions?: boolean;
  reactionFacility?: FacilityKind;
  reactionRigFit?: RigFit;
  reactionSecurity?: SecurityBand;
  reactionFacilityTaxPct?: number;
  reactionBuildSystemId?: number;
  reactionBuildSystemName?: string;
  reactionBuildLocationId?: number;
  reactionBuildLocationName?: string;
  updatedAt: number;
}

export type StationPinScope = 'character' | 'account';

export interface StationPinRecord {
  id: string;
  characterId: number;
  locationId: number;
  scope: StationPinScope;
  updatedAt: number;
}

export interface PlanetRichnessRecord {
  id: string;
  characterId: number;
  planetId: number;
  order: number[];
  updatedAt: number;
}

export interface NotificationFeedRecord {
  id: string;
  characterId: number;
  eventId: string;
  title: string;
  body: string;
  firedAt: number;
  eveType?: string;
  dismissedAt?: number;
  walletChangeIsk?: number;
  fillMatch?: {
    typeId: number;
    locationId: number;
    price: number;
    issuedMs: number;
    quantity: number;
  };
  fillSettledAt?: number;
  syncedAt?: number;
  notifiedHereAt?: number;
  subjectId?: number;
  typeId?: number;
}

export interface FittingRecord {
  id: string;
  characterId: number;
  name: string;
  code: string;
  notes?: string;
  updatedAt: number;
}

export interface PayeeRecord {
  id: string;
  characterId: number;
  name: string;
  defaultTaxPct: number;
  defaultSystems?: { systemId: number; from: string }[];
  systemId?: number;
  hubId?: string;
  entityId?: number;
  entityKind?: 'character' | 'corporation' | 'alliance';
  archivedAt?: number;
  updatedAt: number;
}

export interface MiningTaxOreLine {
  typeId: number;
  quantity: number;
}

export interface MiningTaxQuantityDiff {
  typeId: number;
  before: number;
  after: number;
}

export type MiningTaxAssignmentStatus = 'outstanding' | 'paid' | 'needs-review' | 'dismissed';

export interface MiningTaxAssignmentRecord {
  id: string;
  characterId: number;
  date: string;
  solarSystemId: number;
  payeeId?: string;
  oreLines: MiningTaxOreLine[];
  taxPct: number;
  estimatedValue: number;
  oreLineValues?: Record<number, number>;
  taxOwed: number;
  status: MiningTaxAssignmentStatus;
  reviewDiff?: MiningTaxQuantityDiff[];
  paidAt?: number;
  groupId?: string;
  collectsGrowth?: boolean;
  releasedTypeIds?: number[];
  override?: boolean;
  payment?: MiningTaxPaymentInfo;
  rawOrePriced?: boolean;
  label?: string;
  updatedAt: number;
}

export interface MiningTaxRecordChangeRecord {
  id: string;
  characterId: number;
  reason: RecordChangeReason;
  at: string;
  date: string;
  corporationId?: number;
  minerId?: string;
  closeOut?: ToleranceCloseOut;
  assignments?: AssignmentChange[];
  updatedAt: number;
}

export type MiningTaxPaymentMethod = 'donation' | 'contract' | 'other';

export interface MiningTaxPaymentLinkRecord extends PayeePaymentLink {
  id: string;
  characterId: number;
  updatedAt: number;
}

export type MiningTaxPaymentLinkSource = 'auto' | 'manual';

export interface MiningTaxPaymentLink {
  refId: number;
  source: MiningTaxPaymentLinkSource;
}

export interface MiningTaxPaymentInfo {
  paymentId: string;
  paidOn: string;
  method: MiningTaxPaymentMethod;
  amount: number;
  journalLinks?: MiningTaxPaymentLink[];
  contractLinks?: MiningTaxPaymentLink[];
}

export interface ProductionRunRecord {
  id: string;
  characterId: number;
  buildPlanId: string;
  productTypeID: number;
  quantity: number;
  materialCost: number;
  jobFee: number;
  totalCost: number;
  loggedAt: number;
  updatedAt: number;
  sourceJobId?: number;
}

export interface NetWorthSnapshotRecord {
  id: string;
  characterId: number;
  day: string;
  wallet: number;
  assetValue: number;
  plexValue?: number;
  escrow: number;
  sellStock?: number;
  contractStock?: number;
  hubId: string;
  updatedAt: number;
}

export interface CharacterAcceleratorRecord {
  id: string;
  characterId: number;
  bonus: number;
  expiresAt: number;
  updatedAt: number;
}

export interface ProductionSaleLinkRecord {
  id: string;
  characterId: number;
  runId: string;
  transactionId?: number;
  quantity: number;
  unitPrice: number;
  linkedAt: number;
  updatedAt: number;
}

export interface ProductionLossRecord {
  id: string;
  characterId: number;
  runId: string;
  quantity: number;
  lostAt: number;
  insurancePayout: number;
  journalEntryId?: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProductionOrderWatchRecord {
  id: string;
  characterId: number;
  runId: string;
  orderId: number;
  unitPrice: number;
  initialVolumeRemain: number;
  lastKnownVolumeRemain: number;
  closed: boolean;
  watchedAt: number;
  updatedAt: number;
}

export interface OrderProblemSampleRecord {
  orderId: number;
  characterId: number;
  samples: OrderProblemSample[];
}

export interface MailDraftRecipient {
  recipient_id: number;
  recipient_type: ComposeRecipientType;
  name?: string;
}

export interface MailDraftRecord {
  id: string;
  characterId: number;
  mailId: number;
  kind: 'reply' | 'forward' | 'new';
  recipients: MailDraftRecipient[];
  subject: string;
  body: string;
  format?: 'markup';
  updatedAt: number;
}

export interface IndustryJobHistoryRecord {
  characterId: number;
  jobs: IndustryJob[];
  fetchedAt: number;
  dismissedJobIds?: number[];
}

export interface MiningLedgerHistoryRecord {
  characterId: number;
  rows: MiningLedgerRow[];
  fetchedAt: number;
}

export type WalletJournalArchiveRecord = WalletJournalEntry & { characterId: number };

export type WalletTransactionArchiveRecord = WalletTransaction & { characterId: number };

export type ArchiveKind = 'journal' | 'transactions';

export interface WalletArchiveCoverageRecord {
  characterId: number;
  kind: ArchiveKind;
  windows: Array<[number, number]>;
  archivedAt?: number;
}

export interface HullFitCacheRecord {
  key: string;
  savedAt: number;
  entries: [number, number][];
}

export interface AnsiblexGateRecord {
  id: string;
  fromId: number;
  toId: number;
  name: string;
  source: 'search' | 'paste';
  foundBy: number[];
  savedAt: number;
}

export interface DynamicItemRecord {
  itemId: number;
  typeId: number;
  createdBy: number;
  sourceTypeId: number;
  mutatorTypeId: number;
  attributes: [number, number][];
  savedAt: number;
}

export interface CorpBookObservedRecord {
  characterId: number;
  corporationId: number;
  id: string;
  row: unknown;
  updatedMs: number | null;
}

export interface CorpBookPartRecord {
  characterId: number;
  corporationId: number;
  slot: string;
  version: string;
  at: number;
  data: unknown;
}

export interface CorpBookObservedMetaRecord {
  characterId: number;
  corporationId: number;
  version: string | undefined;
  checkedAt: number;
  fullAt: number;
  watermark: number | null;
  bookCreatedAt?: number;
}

export interface RouteSnapshotRecord {
  characterId: number;
  name: string;
  data: unknown;
  savedAt: number;
  appVersion: string;
}

export type ContractArchiveRecord = Contract & { characterId: number; archiveDate: string };

export interface ContractItemArchiveRecord {
  characterId: number;
  contract_id: number;
  items: ContractItem[];
}
