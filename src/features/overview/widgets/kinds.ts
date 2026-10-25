/**
 * The Widget Kind catalogue: every tile a widget board can show, as plain data.
 *
 * Pure on purpose (no React, Dexie or fetch). The Gallery, the layout
 * reducers, the role presets and the widget shell all read this one table, so
 * "which views does a kind have" and "can it be added" are answered in one
 * place. Titles and descriptions are i18n keys; the strings live in en.json.
 *
 * One table serves both boards (the Overview and the Corp Board): a kind
 * names the boards it is offered on and its category on each. Ids are global,
 * so a corp-only kind's id never reuses a character kind's (`corpWallet`, not
 * `wallet`). Structures and Moon extractions sit on both.
 */
import type { CorpCapability } from '@/engine/corpRoles';
import type { EsiEndpointId } from '@/esi/registry';

export type WidgetSize = 'S' | 'M' | 'L' | 'F';
export type WidgetView = 'number' | 'chart' | 'table';
export type WidgetKindId = string;
/**
 * What a kind with a Show setting draws from its one feed: the wallet's balance or its flow, the
 * corp wallet's divisions, its flow or its income sources, all structures or only the problems.
 * Each kind lists the ones it offers.
 */
export type WidgetShow = 'balance' | 'flow' | 'divisions' | 'sources' | 'all' | 'problems';

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

/** The Corp Board's Gallery groups, in Gallery order. */
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

/** The pages that hold a widget grid. */
export type BoardId = 'overview' | 'corp';

export type KindAvailability = 'available' | 'comingSoon';

export interface WidgetKindDef {
  id: WidgetKindId;
  titleKey: string;
  descKey: string;
  /** Its Gallery group on the Overview, or on the Corp Board for a corp-only kind. */
  category: KindCategory;
  /** The boards that offer it, and its Gallery group on each. */
  boards: Partial<Record<BoardId, KindCategory>>;
  /**
   * Corp kinds: the capabilities that open it, any one of which will do. A
   * Character holding none never sees it (corp UI hides rather than locks).
   * Empty for a kind with no corp gate.
   */
  capabilities: readonly CorpCapability[];
  views: readonly WidgetView[];
  defaultSize: WidgetSize;
  defaultView: WidgetView;
  /** Whether the kind reads a time window (7 / 30 / 90 days). */
  hasRange: boolean;
  /** Whether the time window also offers a year (a price-history kind). */
  hasLongRange: boolean;
  /** Whether the pilot picks which items and Trade Hubs the widget draws (Market Trend). */
  hasTrendSources: boolean;
  /** Whether the kind reads the pilot's Omega plan (PLEX per 30 days), a per-widget setting. */
  hasPlexPlan: boolean;
  /** Whether the kind lists calendar events and lets the pilot pick which (accepted and tentative, or all). */
  hasCalendarEvents: boolean;
  /** Whether the kind has the Where setting (My alliance / Near me) and its jumps radius. */
  hasRaidsWhere: boolean;
  /** Whether the kind has the Source setting (Builds / Trading / Both): Profit. */
  hasProfitSource: boolean;
  /** The Show setting's options, the default first; empty for a kind without one. */
  shows: readonly WidgetShow[];
  /** Shows that read no time window, so Range does not apply to them. */
  rangelessShows: readonly WidgetShow[];
  /** A Show other than the default names the widget (Wallet flow, Cash flow); else it keeps the kind's title. */
  hasNamedShows: boolean;
  /** ESI endpoints the kind needs, for the "needs permission" state. */
  endpoints: readonly EsiEndpointId[];
  emptyMessageKey: string;
  availability: KindAvailability;
}

/** The wallet reads that price market sales: Profit's Trading source needs them. */
export const WALLET_TRADE_ENDPOINTS: readonly EsiEndpointId[] = [
  'getCharacterWalletJournal',
  'getCharacterWalletTransactions',
];

const NCT: readonly WidgetView[] = ['number', 'chart', 'table'];
const NT: readonly WidgetView[] = ['number', 'table'];
const N: readonly WidgetView[] = ['number'];

interface Spec {
  /** The Overview's Gallery group; absent for a corp-only kind. */
  category?: OverviewCategory;
  /** The Corp Board's Gallery group; absent for a kind the Corp Board does not offer. */
  corp?: CorpCategory;
  /** Any one of these opens a corp kind. */
  capabilities?: readonly CorpCapability[];
  views: readonly WidgetView[];
  /** The view a new widget of this kind opens in: the one that answers the kind's question best. */
  view: WidgetView;
  size: WidgetSize;
  range?: true;
  longRange?: true;
  trendSources?: true;
  plexPlan?: true;
  calendarEvents?: true;
  raidsWhere?: true;
  profitSource?: true;
  /** The Show options, the default first. */
  shows?: readonly WidgetShow[];
  /** Shows that read no window (a kind with `range` and a Show only some of whose options are ranged). */
  rangelessShows?: readonly WidgetShow[];
  /** Each non-default Show has its own title and empty copy (`overview.widgets.<id>.shows.<show>`). */
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
  // Every endpoint any Source needs; one widget's come from its `KindDef.bySettings` (Builds needs none).
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
    capabilities: ['canReadStructures'],
    views: NCT,
    view: 'table',
    size: 'M',
    // Problems only: a timer, fuel at warning or worse, or an offline service.
    shows: ['all', 'problems'],
    endpoints: ['getCorporationStructures'],
  },
  moonChunks: {
    category: 'planets',
    corp: 'corpClocks',
    capabilities: ['canReadMoonExtractions'],
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
  // The game clock (UTC); reads no feed, so it needs no permission and is always ready.
  eveTime: { category: 'travel', views: N, view: 'number', size: 'S', endpoints: [] },
  comingUp: {
    category: 'messages',
    views: NT,
    view: 'table',
    size: 'M',
    calendarEvents: true,
    endpoints: ['getCharacterCalendar'],
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

  // --- Corp Board only ----------------------------------------------------
  corpDeadlines: {
    corp: 'corpClocks',
    capabilities: [
      'canReadStructures',
      'canReadMoonExtractions',
      'canReadIndustry',
      'canReadSkyhooks',
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
    // Division balances are as of now: Range is offered only for Flow and Sources.
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
  // zKillboard's all-time totals, not corp ESI: no capability, so any Character on the board sees it.
  corpKills: { corp: 'corpOps', views: N, view: 'number', size: 'S', endpoints: [] },
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
  // Firestore under the officer rules, not ESI: gated on the SRP officer capability, hidden without it.
  corpSrp: {
    corp: 'corpOps',
    capabilities: ['canManageSrp'],
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: [],
  },
} satisfies Record<string, Spec>;

/** The id of every kind this file defines, for tables keyed by kind that must follow a rename. */
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

/** The Show a widget draws: its stored one when the kind offers it, else the default; none for a kind without. */
export function showOf(kind: WidgetKindDef, stored: unknown): WidgetShow | undefined {
  return isShowOf(kind, stored) ? stored : kind.shows[0];
}

/** What a widget stores for `value`: a Show the kind offers other than its default, else nothing. */
export function storedShow(kind: WidgetKindDef, value: unknown): WidgetShow | undefined {
  return isShowOf(kind, value) && value !== kind.shows[0] ? value : undefined;
}

/** Whether the widget's Range changes what it draws: the kind reads a window and so does its Show. */
export function rangeAppliesTo(kind: WidgetKindDef, stored: unknown): boolean {
  const show = showOf(kind, stored);
  return kind.hasRange && (show === undefined || !kind.rangelessShows.includes(show));
}

/** A widget's title and empty-state keys: a Show other than the default carries its own. */
export function widgetKeys(
  kind: WidgetKindDef,
  stored: unknown
): { titleKey: string; emptyMessageKey: string } {
  const show = showOf(kind, stored);
  if (show === undefined || show === kind.shows[0] || !kind.hasNamedShows) {
    return { titleKey: kind.titleKey, emptyMessageKey: kind.emptyMessageKey };
  }
  // Spelled out, not a prefix variable plus ".title": a template ending in a bare segment pins every
  // `title` and `empty` key of the lazy locale into the startup shell (localeSplit.ts).
  return {
    titleKey: `overview.widgets.${kind.id}.shows.${show}.title`,
    emptyMessageKey: `overview.widgets.${kind.id}.shows.${show}.empty`,
  };
}

/** A kind the pilot can put on a board: known and actually built. */
export function isAddable(id: WidgetKindId): boolean {
  return BY_ID.get(id)?.availability === 'available';
}

/** The kinds `board` offers, in catalogue order. */
export function boardKinds(board: BoardId): WidgetKindDef[] {
  return WIDGET_KINDS.filter((kind) => kind.boards[board] !== undefined);
}

/** Whether a Character with `held` capabilities may see `kind`: a kind with no corp gate always may. */
export function kindOpenTo(
  kind: WidgetKindDef,
  held: Readonly<Record<CorpCapability, boolean>> | null
): boolean {
  if (kind.capabilities.length === 0) return true;
  return held !== null && kind.capabilities.some((capability) => held[capability]);
}
