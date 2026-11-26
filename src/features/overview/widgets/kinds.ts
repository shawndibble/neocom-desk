import type { CorpCapability } from '@/engine/corpRoles';
import type { EsiEndpointId } from '@/esi/registry';

export type WidgetSize = 'S' | 'M' | 'L' | 'F';
export type WidgetView = 'number' | 'chart' | 'table';
export type WidgetKindId = string;
export type WidgetShow =
  | 'balance'
  | 'flow'
  | 'divisions'
  | 'sources'
  | 'all'
  | 'problems'
  | 'withAccelerator'
  | 'skillsOnly';

export const KIND_CATEGORIES = [
  'character',
  'money',
  'trade',
  'industry',
  'planets',
  'travel',
  'conflict',
  'messages',
] as const;

export const CORP_KIND_CATEGORIES = [
  'corpClocks',
  'corpStructures',
  'corpMoney',
  'corpPeople',
  'corpIndustry',
  'corpOps',
] as const;

export type OverviewCategory = (typeof KIND_CATEGORIES)[number];
export type CorpCategory = (typeof CORP_KIND_CATEGORIES)[number];
export type KindCategory = OverviewCategory | CorpCategory;

export type BoardId = 'overview' | 'corp';

export type KindAvailability = 'available' | 'comingSoon';

export interface WidgetKindDef {
  id: WidgetKindId;
  titleKey: string;
  descKey: string;
  category: KindCategory;
  boards: Partial<Record<BoardId, KindCategory>>;
  capabilities: readonly CorpCapability[];
  views: readonly WidgetView[];
  defaultSize: WidgetSize;
  defaultView: WidgetView;
  hasRange: boolean;
  hasLongRange: boolean;
  hasTrendSources: boolean;
  hasPlexPlan: boolean;
  hasCalendarEvents: boolean;
  hasRaidsWhere: boolean;
  hasProfitSource: boolean;
  hasLayerPicker: boolean;
  hasCampaignFaction: boolean;
  shows: readonly WidgetShow[];
  rangelessShows: readonly WidgetShow[];
  hasNamedShows: boolean;
  endpoints: readonly EsiEndpointId[];
  emptyMessageKey: string;
  availability: KindAvailability;
}

export const WALLET_TRADE_ENDPOINTS: readonly EsiEndpointId[] = [
  'getCharacterWalletJournal',
  'getCharacterWalletTransactions',
];

const NCT: readonly WidgetView[] = ['number', 'chart', 'table'];
const NT: readonly WidgetView[] = ['number', 'table'];
const N: readonly WidgetView[] = ['number'];

interface Spec {
  category?: OverviewCategory;
  corp?: CorpCategory;
  capabilities?: readonly CorpCapability[];
  views: readonly WidgetView[];
  view: WidgetView;
  size: WidgetSize;
  range?: true;
  longRange?: true;
  trendSources?: true;
  plexPlan?: true;
  calendarEvents?: true;
  raidsWhere?: true;
  profitSource?: true;
  layerPicker?: true;
  campaignFaction?: true;
  shows?: readonly WidgetShow[];
  rangelessShows?: readonly WidgetShow[];
  namedShows?: true;
  soon?: true;
  endpoints: readonly EsiEndpointId[];
}

const SPECS = {
  training: {
    category: 'character',
    views: NCT,
    view: 'number',
    size: 'S',
    endpoints: ['getCharacterSkillQueue', 'getCharacterSkills'],
    shows: ['withAccelerator', 'skillsOnly'],
  },
  sp: {
    category: 'character',
    views: NT,
    view: 'number',
    size: 'S',
    endpoints: ['getCharacterSkills'],
  },
  location: {
    category: 'character',
    views: NT,
    view: 'number',
    size: 'S',
    endpoints: ['getCharacterLocation', 'getCharacterShip'],
  },
  jumpTimers: {
    category: 'travel',
    views: NT,
    view: 'number',
    size: 'S',
    endpoints: ['getCharacterClones', 'getCharacterFatigue'],
  },
  clones: {
    category: 'character',
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: [
      'getCharacterClones',
      'getCharacterSkills',
      'getCharacterSkillQueue',
      'getCharacterAttributes',
      'getCharacterImplants',
    ],
  },
  wallet: {
    category: 'money',
    views: NCT,
    view: 'chart',
    size: 'S',
    range: true,
    shows: ['balance', 'flow'],
    namedShows: true,
    endpoints: ['getCharacterWallet', 'getCharacterWalletJournal'],
  },
  netWorth: {
    category: 'money',
    views: NCT,
    view: 'chart',
    size: 'M',
    layerPicker: true,
    endpoints: ['getCharacterWallet', 'getCharacterAssets', 'getCharacterOrders'],
  },
  orders: {
    category: 'trade',
    views: NCT,
    view: 'table',
    size: 'L',
    endpoints: ['getCharacterOrders'],
  },
  priceWatch: {
    category: 'trade',
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: [],
  },
  marketTrend: {
    category: 'trade',
    views: NCT,
    view: 'chart',
    size: 'M',
    range: true,
    longRange: true,
    trendSources: true,
    endpoints: [],
  },
  stock: {
    category: 'trade',
    views: NCT,
    view: 'table',
    size: 'M',
    endpoints: ['getCharacterOrders'],
  },
  omega: {
    category: 'money',
    views: NCT,
    view: 'chart',
    size: 'M',
    plexPlan: true,
    range: true,
    endpoints: ['getCharacterWalletJournal', 'getCharacterWalletTransactions'],
  },
  lp: {
    category: 'money',
    views: NCT,
    view: 'chart',
    size: 'M',
    endpoints: ['getCharacterLoyaltyPoints'],
  },
  belowMarket: {
    category: 'trade',
    views: NT,
    view: 'number',
    size: 'S',
    endpoints: [],
  },
  miningTax: {
    category: 'industry',
    views: NT,
    view: 'number',
    size: 'S',
    endpoints: ['getCharacterMining'],
  },
  industry: {
    category: 'industry',
    views: NCT,
    view: 'table',
    size: 'M',
    endpoints: ['getCharacterIndustryJobs'],
  },
  profit: {
    category: 'money',
    views: NCT,
    view: 'chart',
    size: 'M',
    range: true,
    profitSource: true,
    endpoints: WALLET_TRADE_ENDPOINTS,
  },
  miningYield: {
    category: 'industry',
    views: NCT,
    view: 'chart',
    size: 'M',
    range: true,
    endpoints: ['getCharacterMining'],
  },
  survey: {
    category: 'industry',
    views: NCT,
    view: 'chart',
    size: 'M',
    endpoints: [],
  },
  planetary: {
    category: 'planets',
    views: NCT,
    view: 'table',
    size: 'M',
    endpoints: ['getCharacterPlanets'],
  },
  mercenaryDens: {
    category: 'planets',
    views: NT,
    view: 'table',
    size: 'L',
    endpoints: [
      'getCharacterMercenaryDens',
      'getCharacterMercenaryDen',
      'getCharacterMercenaryOperations',
      'getCharacterMercenaryOperation',
    ],
  },
  structures: {
    category: 'planets',
    corp: 'corpStructures',
    capabilities: ['canReadStructures', 'canReadStarbases'],
    views: NCT,
    view: 'table',
    size: 'M',
    shows: ['all', 'problems'],
    endpoints: ['getCorporationStructures', 'getCorporationStarbases'],
  },
  moonChunks: {
    category: 'planets',
    corp: 'corpClocks',
    capabilities: ['canReadMoonExtractions', 'canViewTaxBook'],
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationMiningExtractions'],
  },
  incursions: {
    category: 'conflict',
    views: NT,
    view: 'table',
    size: 'S',
    endpoints: [],
  },
  sovRaids: {
    category: 'conflict',
    views: NT,
    view: 'table',
    size: 'M',
    raidsWhere: true,
    endpoints: [],
  },
  militaryCampaigns: {
    category: 'conflict',
    views: NT,
    view: 'table',
    size: 'M',
    campaignFaction: true,
    endpoints: ['getCharacterMilitaryCampaignObjectives'],
  },
  routeSafety: {
    category: 'travel',
    views: NCT,
    view: 'chart',
    size: 'M',
    endpoints: [],
  },
  hauling: {
    category: 'trade',
    views: NT,
    view: 'number',
    size: 'M',
    endpoints: [],
  },
  kills: {
    category: 'conflict',
    views: NCT,
    view: 'number',
    size: 'M',
    range: true,
    endpoints: [],
  },
  eveTime: { category: 'travel', views: N, view: 'number', size: 'S', endpoints: [] },
  comingUp: {
    category: 'messages',
    views: NT,
    view: 'table',
    size: 'M',
    calendarEvents: true,
    endpoints: [
      'getCharacterCalendar',
      'getCharacterSkillQueue',
      'getCharacterIndustryJobs',
      'getCharacterPlanets',
      'getCharacterContracts',
      'getCharacterOrders',
      'getCharacterMercenaryDens',
    ],
  },
  contracts: {
    category: 'messages',
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: ['getCharacterContracts'],
  },
  mail: {
    category: 'messages',
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: ['getCharacterMailLabels', 'getCharacterMailHeaders'],
  },

  corpDeadlines: {
    corp: 'corpClocks',
    capabilities: [
      'canReadStructures',
      'canReadMoonExtractions',
      'canReadIndustry',
      'canReadSkyhooks',
      'canViewTaxBook',
    ],
    views: NCT,
    view: 'chart',
    size: 'L',
    endpoints: [
      'getCorporationStructures',
      'getCorporationMiningExtractions',
      'getCorporationIndustryJobs',
      'getCorporationSkyhooks',
      'getCorporationSovereigntyHubs',
    ],
  },
  corpStarbases: {
    corp: 'corpStructures',
    capabilities: ['canReadStarbases'],
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationStarbases', 'getCorporationStarbase'],
  },
  corpSovereignty: {
    corp: 'corpClocks',
    capabilities: ['canReadSkyhooks'],
    views: NCT,
    view: 'table',
    size: 'M',
    endpoints: [
      'getCorporationSkyhooks',
      'getCorporationSkyhook',
      'getCorporationSovereigntyHubs',
      'getCorporationSovereigntyHub',
      'getUniversePlanet',
    ],
  },
  corpCustomsOffices: {
    corp: 'corpClocks',
    capabilities: ['canReadCustomsOffices'],
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationCustomsOffices'],
  },
  corpWallet: {
    corp: 'corpMoney',
    capabilities: ['canReadWallet'],
    views: NCT,
    view: 'table',
    size: 'M',
    range: true,
    shows: ['divisions', 'flow', 'sources'],
    namedShows: true,
    rangelessShows: ['divisions'],
    endpoints: ['getCorporationWallets', 'getCorporationDivisions', 'getCorporationWalletJournal'],
  },
  corpOrders: {
    corp: 'corpMoney',
    capabilities: ['canReadOrders'],
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationOrders'],
  },
  corpMembers: {
    corp: 'corpPeople',
    capabilities: ['canReadMembers'],
    views: NCT,
    view: 'number',
    size: 'S',
    endpoints: ['getCorporationMembers', 'getCorporationMemberTracking'],
  },
  corpInactive: {
    corp: 'corpPeople',
    capabilities: ['canReadMembers'],
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationMemberTracking'],
  },
  corpRoleAudit: {
    corp: 'corpPeople',
    capabilities: ['canReadRoleAudit'],
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationMemberRoles', 'getCorporationRoleHistory'],
  },
  corpJobs: {
    corp: 'corpIndustry',
    capabilities: ['canReadIndustry'],
    views: NCT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationIndustryJobs'],
  },
  corpMining: {
    corp: 'corpIndustry',
    capabilities: ['canReadMiningLedger'],
    views: NCT,
    view: 'table',
    size: 'M',
    range: true,
    endpoints: ['getCorporationMiningObservers', 'getCorporationMiningObserver'],
  },
  corpKills: { corp: 'corpOps', views: NT, view: 'number', size: 'S', endpoints: [] },
  corpContracts: {
    corp: 'corpOps',
    capabilities: ['canReadContracts'],
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationContracts'],
  },
  corpAssets: {
    corp: 'corpOps',
    capabilities: ['canReadAssets'],
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationAssets'],
  },
  corpSrp: {
    corp: 'corpOps',
    capabilities: ['canManageSrp'],
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: [],
  },
} satisfies Record<string, Spec>;

export type DefinedKindId = keyof typeof SPECS;

export const WIDGET_KINDS: readonly WidgetKindDef[] = Object.entries(
  SPECS as Record<string, Spec>
).map(([id, s]) => ({
  id,
  titleKey: `overview.widgets.${id}.title`,
  descKey: `overview.widgets.${id}.description`,
  category: (s.category ?? s.corp)!,
  boards: {
    ...(s.category ? { overview: s.category } : {}),
    ...(s.corp ? { corp: s.corp } : {}),
  },
  capabilities: s.capabilities ?? [],
  views: s.views,
  defaultSize: s.size,
  defaultView: s.view,
  hasRange: s.range === true,
  hasLongRange: s.longRange === true,
  hasTrendSources: s.trendSources === true,
  hasPlexPlan: s.plexPlan === true,
  hasCalendarEvents: s.calendarEvents === true,
  hasRaidsWhere: s.raidsWhere === true,
  hasProfitSource: s.profitSource === true,
  hasLayerPicker: s.layerPicker === true,
  hasCampaignFaction: s.campaignFaction === true,
  shows: s.shows ?? [],
  rangelessShows: s.rangelessShows ?? [],
  hasNamedShows: s.namedShows === true,
  endpoints: s.endpoints,
  emptyMessageKey: `overview.widgets.${id}.empty`,
  availability: s.soon ? 'comingSoon' : 'available',
}));

const BY_ID = new Map(WIDGET_KINDS.map((k) => [k.id, k]));

export function getKind(id: WidgetKindId): WidgetKindDef | undefined {
  return BY_ID.get(id);
}

const isShowOf = (kind: WidgetKindDef, value: unknown): value is WidgetShow =>
  kind.shows.some((show) => show === value);

export function showOf(kind: WidgetKindDef, stored: unknown): WidgetShow | undefined {
  return isShowOf(kind, stored) ? stored : kind.shows[0];
}

export function storedShow(kind: WidgetKindDef, value: unknown): WidgetShow | undefined {
  return isShowOf(kind, value) && value !== kind.shows[0] ? value : undefined;
}

export function rangeAppliesTo(kind: WidgetKindDef, stored: unknown): boolean {
  const show = showOf(kind, stored);
  return kind.hasRange && (show === undefined || !kind.rangelessShows.includes(show));
}

export function widgetKeys(
  kind: WidgetKindDef,
  stored: unknown
): { titleKey: string; emptyMessageKey: string } {
  const show = showOf(kind, stored);
  if (show === undefined || show === kind.shows[0] || !kind.hasNamedShows) {
    return { titleKey: kind.titleKey, emptyMessageKey: kind.emptyMessageKey };
  }
  return {
    titleKey: `overview.widgets.${kind.id}.shows.${show}.title`,
    emptyMessageKey: `overview.widgets.${kind.id}.shows.${show}.empty`,
  };
}

export function isAddable(id: WidgetKindId): boolean {
  return BY_ID.get(id)?.availability === 'available';
}

export function boardKinds(board: BoardId): WidgetKindDef[] {
  return WIDGET_KINDS.filter((kind) => kind.boards[board] !== undefined);
}

export function kindOpenTo(
  kind: WidgetKindDef,
  held: Readonly<Record<CorpCapability, boolean>> | null
): boolean {
  if (kind.capabilities.length === 0) return true;
  return held !== null && kind.capabilities.some((capability) => held[capability]);
}
