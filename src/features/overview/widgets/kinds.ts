/**
 * The Widget Kind catalogue: every tile the Overview can show, as plain data.
 *
 * Pure on purpose (no React, Dexie or fetch). The Gallery, the layout
 * reducers, the role presets and the widget shell all read this one table, so
 * "which views does a kind have" and "can it be added" are answered in one
 * place. Titles and descriptions are i18n keys; the strings live in en.json.
 */
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
export type KindCategory = (typeof KIND_CATEGORIES)[number];

export type KindAvailability = 'available' | 'comingSoon';

export interface WidgetKindDef {
  id: WidgetKindId;
  titleKey: string;
  descKey: string;
  category: KindCategory;
  views: readonly WidgetView[];
  defaultSize: WidgetSize;
  defaultView: WidgetView;
  /** Whether the kind reads a time window (7 / 30 / 90 days). */
  hasRange: boolean;
  /** ESI endpoints the kind needs, for the "needs permission" state. */
  endpoints: readonly EsiEndpointId[];
  emptyMessageKey: string;
  availability: KindAvailability;
}

const NCT: readonly WidgetView[] = ['number', 'chart', 'table'];
const NT: readonly WidgetView[] = ['number', 'table'];

interface Spec {
  category: KindCategory;
  views: readonly WidgetView[];
  /** The view a new widget of this kind opens in: the one that answers the kind's question best. */
  view: WidgetView;
  size: WidgetSize;
  range?: true;
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
    soon: true,
    endpoints: ['getCharacterClones'],
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
  lp: {
    category: 'money',
    views: NCT,
    view: 'chart',
    size: 'M',
    endpoints: ['getCharacterLoyaltyPoints'],
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
    view: 'number',
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
    views: NCT,
    view: 'table',
    size: 'M',
    endpoints: ['getCorporationStructures'],
  },
  moonChunks: {
    category: 'planets',
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
    soon: true,
    endpoints: [],
  },
  kills: {
    category: 'space',
    views: NCT,
    view: 'number',
    size: 'M',
    range: true,
    soon: true,
    endpoints: [],
  },
  comingUp: {
    category: 'messages',
    views: NT,
    view: 'table',
    size: 'M',
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
};

export const WIDGET_KINDS: readonly WidgetKindDef[] = Object.entries(SPECS).map(([id, s]) => ({
  id,
  titleKey: `overview.widgets.${id}.title`,
  descKey: `overview.widgets.${id}.description`,
  category: s.category,
  views: s.views,
  defaultSize: s.size,
  defaultView: s.view,
  hasRange: s.range === true,
  endpoints: s.endpoints,
  emptyMessageKey: `overview.widgets.${id}.empty`,
  availability: s.soon ? 'comingSoon' : 'available',
}));

const BY_ID = new Map(WIDGET_KINDS.map((k) => [k.id, k]));

export function getKind(id: WidgetKindId): WidgetKindDef | undefined {
  return BY_ID.get(id);
}

export function isKnownKind(id: WidgetKindId): boolean {
  return BY_ID.has(id);
}

/** A kind the pilot can put on the Overview: known and actually built. */
export function isAddable(id: WidgetKindId): boolean {
  return BY_ID.get(id)?.availability === 'available';
}
