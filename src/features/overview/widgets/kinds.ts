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
export type WidgetView = 'number' | 'chart' | 'list';
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
  /** Shown with a "New" tag to returning pilots. */
  isNew: boolean;
  /** ESI endpoints the kind needs, for the "needs permission" state. */
  endpoints: readonly EsiEndpointId[];
  emptyMessageKey: string;
  availability: KindAvailability;
}

const NCL: readonly WidgetView[] = ['number', 'chart', 'list'];
const NL: readonly WidgetView[] = ['number', 'list'];

interface Spec {
  category: KindCategory;
  views: readonly WidgetView[];
  size: WidgetSize;
  range?: true;
  isNew?: true;
  soon?: true;
  endpoints: readonly EsiEndpointId[];
}

const SPECS: Record<string, Spec> = {
  training: {
    category: 'character',
    views: NCL,
    size: 'S',
    endpoints: ['getCharacterSkillQueue', 'getCharacterSkills'],
  },
  sp: { category: 'character', views: NL, size: 'S', endpoints: ['getCharacterSkills'] },
  location: {
    category: 'character',
    views: NL,
    size: 'S',
    isNew: true,
    endpoints: ['getCharacterLocation', 'getCharacterShip'],
  },
  jumpTimers: {
    category: 'character',
    views: NL,
    size: 'S',
    isNew: true,
    soon: true,
    endpoints: ['getCharacterClones'],
  },
  clones: {
    category: 'character',
    views: NL,
    size: 'M',
    isNew: true,
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
    views: NCL,
    size: 'S',
    range: true,
    endpoints: ['getCharacterWallet', 'getCharacterWalletJournal'],
  },
  walletFlow: {
    category: 'money',
    views: NCL,
    size: 'M',
    range: true,
    isNew: true,
    endpoints: ['getCharacterWallet', 'getCharacterWalletJournal'],
  },
  netWorth: {
    category: 'money',
    views: NCL,
    size: 'L',
    isNew: true,
    endpoints: ['getCharacterWallet', 'getCharacterAssets', 'getCharacterOrders'],
  },
  orders: { category: 'money', views: NCL, size: 'M', endpoints: ['getCharacterOrders'] },
  priceWatch: { category: 'money', views: NL, size: 'M', isNew: true, endpoints: [] },
  stock: {
    category: 'money',
    views: NCL,
    size: 'M',
    isNew: true,
    endpoints: ['getCharacterOrders'],
  },
  lp: {
    category: 'money',
    views: NCL,
    size: 'S',
    isNew: true,
    endpoints: ['getCharacterLoyaltyPoints'],
  },
  miningTax: { category: 'industry', views: NL, size: 'S', endpoints: ['getCharacterMining'] },
  industry: {
    category: 'industry',
    views: NCL,
    size: 'M',
    endpoints: ['getCharacterIndustryJobs'],
  },
  profit: { category: 'industry', views: NCL, size: 'M', range: true, isNew: true, endpoints: [] },
  miningYield: {
    category: 'industry',
    views: NCL,
    size: 'M',
    range: true,
    isNew: true,
    endpoints: ['getCharacterMining'],
  },
  survey: { category: 'industry', views: NCL, size: 'M', isNew: true, soon: true, endpoints: [] },
  planetary: { category: 'planets', views: NCL, size: 'M', endpoints: ['getCharacterPlanets'] },
  structures: {
    category: 'planets',
    views: NCL,
    size: 'S',
    endpoints: ['getCorporationStructures'],
  },
  moonChunks: {
    category: 'planets',
    views: NL,
    size: 'S',
    endpoints: ['getCorporationMiningExtractions'],
  },
  incursions: { category: 'space', views: NL, size: 'S', isNew: true, endpoints: [] },
  routeSafety: {
    category: 'space',
    views: NCL,
    size: 'M',
    isNew: true,
    soon: true,
    endpoints: [],
  },
  hauling: { category: 'space', views: NL, size: 'M', isNew: true, soon: true, endpoints: [] },
  kills: {
    category: 'space',
    views: NCL,
    size: 'M',
    range: true,
    isNew: true,
    soon: true,
    endpoints: [],
  },
  comingUp: {
    category: 'messages',
    views: NL,
    size: 'M',
    endpoints: ['getCharacterCalendar'],
  },
  contracts: {
    category: 'messages',
    views: NL,
    size: 'S',
    endpoints: ['getCharacterContracts'],
  },
  mail: {
    category: 'messages',
    views: NL,
    size: 'S',
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
  defaultView: 'number',
  hasRange: s.range === true,
  isNew: s.isNew === true,
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
