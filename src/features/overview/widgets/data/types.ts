import type { DeadlineSeverity } from '@/engine/character/severity';
import type { TypedAccelerator } from '@/engine/accelerator';
import type { DayZone } from '@/engine/localDay';
import type { EsiEndpointId } from '@/esi/registry';
import type { StockBoardData } from '@/features/stockTargets/stockBoard';
import type { ExtractionPrices } from '@/features/character/useExtractionPrices';
import type { OpenOrdersPageSnapshot } from '@/features/market/openOrdersPageSnapshot';
import type { CalendarBoardData } from '@/features/character/calendarBoardData';
import type { SharedPopTimePref } from '@/features/character/calendarSharedPops';
import type { CharacterBoardItemKind } from '@/engine/character/board';
import type {
  ContractsBoardData,
  IndustryBoardData,
  MailBoardData,
  MiningTaxBoardData,
  MoonChunksBoardData,
  PlanetaryBoardData,
  PriceAlertsBoardData,
  StructuresBoardData,
} from '../../data/boardData';
import type { IncursionsBoardData } from '../../data/incursionsBoard';
import type { CorpContractsFeed, CorpOrdersFeed, CorpSrpFeed } from './corpFeeds';
import type {
  CorpAssetsFeed,
  CorpCustomsFeed,
  CorpRoleAuditFeed,
  CorpJobsFeed,
  CorpKillsFeed,
  CorpMembersFeed,
  CorpMiningFeed,
  CorpSovereigntyFeed,
  CorpDeadlinesAllFeed,
  CorpAllFeed,
  CorpStarbasesFeed,
  CorpWalletFeed,
} from './corpFeeds';
import type { CorpStockTargets } from '@/features/corp/stockTargets';
import type { BoardDeadline } from '../nextDeadline';
import type { WidgetStateInput } from '../state';
import type {
  CalendarEventsChoice,
  CampaignFaction,
  ProfitSource,
  RaidsWhere,
  WidgetRange,
  WidgetShow,
} from '../layout';
import type { ChartModel, DonutChartModel } from '../charts/types';
import type { ScopeGroup } from '@/esi/registry';
import type { TurnInOfferDetail } from '@/features/campaigns/useTurnIns';
import type { MilitaryCampaignsWidgetData } from '@/features/campaigns/militaryCampaignsWidget';
import type { SkillsQueuePanelData, WalletPanelData } from './loaders';
import type {
  ClonesWidgetData,
  JournalData,
  WalletAllData,
  LocationWidgetData,
  LpWidgetData,
  HaulingWidgetData,
  BelowMarketWidgetData,
  JumpTimersWidgetData,
  MercenaryDensWidgetData,
  SurveyWidgetData,
  MiningYieldWidgetData,
  NetWorthWidgetData,
  ProfitWidgetData,
  RouteSafetyWidgetData,
  KillsWidgetData,
  OmegaWidgetData,
  TradingProfitWidgetData,
  SovRaidsWidgetData,
} from './kindLoaders';
import type { MarketTrendFeed } from './marketTrendLoader';
import type { Translate } from '@/lib/translate';
import type { LayerId } from '@/engine/netWorth/series';

export interface NumberSecondary {
  text: string;
  direction?: 'up' | 'down' | 'flat';
  tone?: 'good' | 'bad' | 'caution';
}

export interface NumberModel {
  value: string;
  iskAmount?: number;
  unit?: string;
  secondary?: NumberSecondary;
  notes?: string[];
  tone: DeadlineSeverity;
  link?: { label: string; to: string };
  rings?: { key: string; label: string; donut: DonutChartModel }[];
}

export interface ListRow {
  key: string;
  title: string;
  detail?: string;
  value: string;
  iskAmount?: number;
  tone: DeadlineSeverity;
  to?: string;
}

export type TableCell =
  | string
  | { text: string; iskAmount: number; prefix?: string }
  | { text: string; hint: string }
  | { text: string; share: { label: string; off: boolean } }
  | { text: string; tone?: 'good' | 'caution' | 'bad'; bar?: number };

export interface TableColumn {
  key: string;
  label: string;
  align?: 'start' | 'end';
  priority?: number;
  grow?: boolean;
  capped?: boolean;
  hideNarrow?: boolean;
  minWidth?: number;
  nameFloor?: boolean;
  sortable?: boolean;
}

export interface TableRowModel {
  key: string;
  cells: TableCell[];
  sort?: (number | string | undefined)[];
  tone?: DeadlineSeverity;
  to?: string;
  detail?: RowDetailModel;
  info?: { typeId: number };
  badge?: string;
  turnIn?: TurnInRowModel;
}

export interface TurnInRowModel {
  name: string;
  offer: TurnInOfferDetail;
  characterId: number;
  characterName: string;
  surfaceLine?: string;
}

export type DetailTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface RowDetailModel {
  title: string;
  status?: { badge?: string; tone?: DetailTone; text?: string; note?: string };
  facts: { label: string; value: string; tone?: 'warning' }[];
  meters?: {
    title: string;
    items: {
      label: string;
      badge: string;
      value: number;
      max: number;
      readout: string;
      note?: string;
    }[];
  };
  list?: {
    title: string;
    items: { key: string; badge?: string; tone?: DetailTone; text: string; value: string }[];
  };
  place?: {
    systemId: number;
    name: string;
    jumps?: number;
    structureId?: number;
  };
  link?: { label: string; to: string };
  secondaryLink?: { label: string; to: string };
}

export interface TableModel {
  columns: TableColumn[];
  rows: TableRowModel[];
  pageable?: boolean;
  fitWidth?: true;
  footer?: string;
  emptyLine?: string;
}

export interface KindView {
  status: WidgetStateInput;
  fetchedAt: Date | null;
  fromCache: boolean;
  number: NumberModel;
  rows: ListRow[];
  table?: TableModel;
  deadlines: BoardDeadline[];
  summary: string;
  to: string | null;
  emptyMessage?: string;
  emptyHint?: string;
  emptyHealthy?: boolean;
  grantEndpoints?: readonly EsiEndpointId[];
  grantCharacterId?: number;
  grantCharacterName?: string;
  headerMark?: {
    characterId: number;
    characterName: string;
    count: number;
    permission: ScopeGroup;
    why: string;
  };
  emptyLinkLabel?: string;
  chart?: ChartModel;
  settling?: boolean;
}

export interface FeedState<T> {
  data: T | null;
  error: boolean;
  loading: boolean;
}

export interface SpExtras {
  monitoring: boolean;
  thresholdSp: number;
  price: ExtractionPrices;
}

export interface FeedMap {
  wallet: WalletPanelData;
  skills: SkillsQueuePanelData;
  orders: OpenOrdersPageSnapshot;
  mining: MiningTaxBoardData;
  planetary: PlanetaryBoardData;
  planetaryAll: PlanetaryBoardData;
  industry: IndustryBoardData;
  contracts: ContractsBoardData;
  mailAll: MailBoardData;
  contractsAll: ContractsBoardData;
  calendar: CalendarBoardData;
  calendarAll: CalendarBoardData;
  mail: MailBoardData;
  priceAlerts: PriceAlertsBoardData;
  stock: { board: StockBoardData | null };
  structures: StructuresBoardData;
  moonChunks: MoonChunksBoardData;
  structuresAll: StructuresBoardData;
  moonChunksAll: MoonChunksBoardData;
  corpDeadlinesAll: CorpDeadlinesAllFeed;
  corpWalletAll: CorpAllFeed<CorpWalletFeed>;
  corpJobsAll: CorpAllFeed<CorpJobsFeed>;
  corpKillsAll: CorpAllFeed<CorpKillsFeed>;
  incursions: IncursionsBoardData;
  sovRaids: SovRaidsWidgetData;
  spExtras: SpExtras;
  accelerator: ReadonlyMap<number, TypedAccelerator>;
  journal: JournalData;
  walletAll: WalletAllData;
  journalAll: JournalData;
  netWorth: NetWorthWidgetData;
  profit: ProfitWidgetData;
  profitAll: ProfitWidgetData;
  miningYield: MiningYieldWidgetData;
  lp: LpWidgetData;
  survey: SurveyWidgetData;
  hauling: HaulingWidgetData;
  belowMarket: BelowMarketWidgetData;
  clones: ClonesWidgetData;
  jumpTimers: JumpTimersWidgetData;
  mercenaryDens: MercenaryDensWidgetData;
  militaryCampaigns: MilitaryCampaignsWidgetData;
  location: LocationWidgetData;
  routeSafety: RouteSafetyWidgetData;
  kills: KillsWidgetData;
  omega: OmegaWidgetData;
  marketTrend: MarketTrendFeed;
  tradingProfit: TradingProfitWidgetData;
  corpWallet: CorpWalletFeed;
  corpJobs: CorpJobsFeed;
  corpCustoms: CorpCustomsFeed;
  corpAssets: CorpAssetsFeed;
  corpStockTargets: CorpStockTargets;
  corpRoleAudit: CorpRoleAuditFeed;
  corpMembers: CorpMembersFeed;
  corpMining: CorpMiningFeed;
  corpStarbases: CorpStarbasesFeed;
  corpSovereignty: CorpSovereigntyFeed;
  corpContracts: CorpContractsFeed;
  corpOrders: CorpOrdersFeed;
  corpCustomsAll: CorpCustomsFeed;
  corpStarbasesAll: CorpStarbasesFeed;
  corpSovereigntyAll: CorpSovereigntyFeed;
  corpContractsAll: CorpContractsFeed;
  corpOrdersAll: CorpOrdersFeed;
  corpAssetsAll: CorpAllFeed<CorpAssetsFeed>;
  corpSrpAll: CorpSrpFeed;
  corpMembersAll: CorpMembersFeed;
  corpRoleAuditAll: CorpRoleAuditFeed;
  corpKills: CorpKillsFeed;
  corpSrp: CorpSrpFeed;
}

export type FeedId = keyof FeedMap;
export type Feeds = { [K in FeedId]?: FeedState<FeedMap[K]> };

export interface BuildContext {
  t: Translate;
  now: number;
  activeCharacterId: number | null;
  scopeAll: boolean;
  notTrainingAlert: boolean;
  range: WidgetRange;
  plexPer30Days?: number;
  calendarEvents?: CalendarEventsChoice;
  hiddenKinds?: CharacterBoardItemKind[];
  raidsWhere?: RaidsWhere;
  raidsRadius?: number;
  profitSource?: ProfitSource;
  hiddenLayers?: LayerId[];
  campaignFaction?: CampaignFaction;
  trendItems?: number[];
  trendHubs?: string[];
  show?: WidgetShow;
  zone?: DayZone;
  sharedPopTime?: SharedPopTimePref;
}
