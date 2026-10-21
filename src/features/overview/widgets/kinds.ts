/**
 * The Widget Kind catalogue: every tile a widget board can show, as plain data.
 *
 * Pure on purpose (no React, Dexie or fetch). The Gallery, the layout
 * reducers, the role presets and the widget shell all read this one table, so
 * "which views does a kind have" and "can it be added" are answered in one
 * place. Titles and descriptions are i18n keys; the strings live in en.json.
 *
 * One table serves both boards (the Overview and the Corp overview): a kind
 * names the boards it is offered on and its category on each. Ids are global,
 * so a corp-only kind's id never reuses a character kind's (`corpWallet`, not
 * `wallet`). Structures and Moon extractions sit on both.
 */
import type { CorpCapability } from '@/engine/corpRoles';
import type { EsiEndpointId } from '@/esi/registry';

export type WidgetSize = 'S' | 'M' | 'L' | 'F';
export type WidgetView = 'number' | 'chart' | 'table';
export type WidgetKindId = string;

export const KIND_CATEGORIES = [
  'character',
  'money',
  'industry',
  'planets',
  'space',
  'messages',
] as const;

/** The Corp overview's Gallery groups, in Gallery order. */
export const CORP_KIND_CATEGORIES = [
  'corpClocks',
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
  /** Its Gallery group on the Overview, or on the Corp overview for a corp-only kind. */
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
  /** Whether the kind reads the pilot's Omega plan (PLEX per 30 days), a per-widget setting. */
  hasPlexPlan: boolean;
  /** Whether the kind lists calendar events and lets the pilot pick which (accepted and tentative, or all). */
  hasCalendarEvents: boolean;
  /** ESI endpoints the kind needs, for the "needs permission" state. */
  endpoints: readonly EsiEndpointId[];
  emptyMessageKey: string;
  availability: KindAvailability;
}

const NCT: readonly WidgetView[] = ['number', 'chart', 'table'];
const NT: readonly WidgetView[] = ['number', 'table'];
const N: readonly WidgetView[] = ['number'];

interface Spec {
  /** The Overview's Gallery group; absent for a corp-only kind. */
  category?: OverviewCategory;
  /** The Corp overview's Gallery group; absent for a kind the Corp overview does not offer. */
  corp?: CorpCategory;
  /** Any one of these opens a corp kind. */
  capabilities?: readonly CorpCapability[];
  views: readonly WidgetView[];
  /** The view a new widget of this kind opens in: the one that answers the kind's question best. */
  view: WidgetView;
  size: WidgetSize;
  range?: true;
  plexPlan?: true;
  calendarEvents?: true;
  soon?: true;
  endpoints: readonly EsiEndpointId[];
}

const SPECS: Record<string, Spec> = {
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
    category: 'character',
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
    endpoints: ['getCharacterWallet', 'getCharacterWalletJournal'],
  },
  walletFlow: {
    category: 'money',
    views: NCT,
    view: 'chart',
    size: 'M',
    range: true,
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
    category: 'money',
    views: NCT,
    view: 'table',
    size: 'L',
    endpoints: ['getCharacterOrders'],
  },
  priceWatch: {
    category: 'money',
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: [],
  },
  stock: {
    category: 'money',
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
  tradingProfit: {
    category: 'money',
    views: NCT,
    view: 'number',
    size: 'M',
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
    category: 'money',
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
    category: 'industry',
    views: NCT,
    view: 'chart',
    size: 'M',
    range: true,
    endpoints: [],
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
  structures: {
    category: 'planets',
    corp: 'corpClocks',
    capabilities: ['canReadStructures'],
    views: NCT,
    view: 'table',
    size: 'M',
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
    category: 'space',
    views: NT,
    view: 'table',
    size: 'S',
    endpoints: [],
  },
  routeSafety: {
    category: 'space',
    views: NCT,
    view: 'chart',
    size: 'M',
    endpoints: [],
  },
  hauling: {
    category: 'space',
    views: NT,
    view: 'number',
    size: 'M',
    endpoints: [],
  },
  kills: {
    category: 'space',
    views: NCT,
    view: 'number',
    size: 'M',
    range: true,
    endpoints: [],
  },
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

  // --- Corp overview only ----------------------------------------------------
  corpDeadlines: {
    corp: 'corpClocks',
    capabilities: ['canReadStructures', 'canReadMoonExtractions', 'canReadIndustry'],
    views: NCT,
    view: 'chart',
    size: 'L',
    endpoints: [
      'getCorporationStructures',
      'getCorporationMiningExtractions',
      'getCorporationIndustryJobs',
    ],
  },
  corpServices: {
    corp: 'corpClocks',
    capabilities: ['canReadStructures'],
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationStructures'],
  },
  corpStarbases: {
    corp: 'corpClocks',
    capabilities: ['canReadStarbases'],
    views: NT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationStarbases', 'getCorporationStarbase'],
  },
  corpCustomsOffices: {
    corp: 'corpClocks',
    views: NT,
    view: 'table',
    size: 'M',
    soon: true,
    endpoints: [],
  },
  corpWallet: {
    corp: 'corpMoney',
    capabilities: ['canReadWallet'],
    views: NCT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationWallets', 'getCorporationDivisions'],
  },
  corpCashFlow: {
    corp: 'corpMoney',
    capabilities: ['canReadWallet'],
    views: NCT,
    view: 'chart',
    size: 'M',
    range: true,
    endpoints: ['getCorporationWallets', 'getCorporationWalletJournal'],
  },
  corpIncome: {
    corp: 'corpMoney',
    capabilities: ['canReadWallet'],
    views: NCT,
    view: 'table',
    size: 'M',
    range: true,
    endpoints: ['getCorporationWalletJournal'],
  },
  corpOrders: { corp: 'corpMoney', views: NT, view: 'table', size: 'M', soon: true, endpoints: [] },
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
    views: NT,
    view: 'table',
    size: 'M',
    soon: true,
    endpoints: [],
  },
  corpDoctrine: {
    corp: 'corpPeople',
    views: NT,
    view: 'table',
    size: 'M',
    soon: true,
    endpoints: [],
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
    views: NT,
    view: 'table',
    size: 'M',
    soon: true,
    endpoints: [],
  },
  corpSrp: { corp: 'corpOps', views: NT, view: 'table', size: 'M', soon: true, endpoints: [] },
  corpProjects: { corp: 'corpOps', views: NT, view: 'table', size: 'M', soon: true, endpoints: [] },
};

export const WIDGET_KINDS: readonly WidgetKindDef[] = Object.entries(SPECS).map(([id, s]) => ({
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
  hasPlexPlan: s.plexPlan === true,
  hasCalendarEvents: s.calendarEvents === true,
  endpoints: s.endpoints,
  emptyMessageKey: `overview.widgets.${id}.empty`,
  availability: s.soon ? 'comingSoon' : 'available',
}));

const BY_ID = new Map(WIDGET_KINDS.map((k) => [k.id, k]));

export function getKind(id: WidgetKindId): WidgetKindDef | undefined {
  return BY_ID.get(id);
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
