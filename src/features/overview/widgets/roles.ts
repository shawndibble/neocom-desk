/**
 * First-run Roles: the answer to "What do you do in EVE?" and the Widget Kinds
 * each one brings. Pure data plus the builders that turn an answer (or none)
 * into an Overview Layout.
 */
import { presetSeed } from './galleryPresets';
import { isAddable, type WidgetKindId } from './kinds';
import {
  MAX_WIDGETS,
  seedKind,
  seedWidget,
  type MakeId,
  type OverviewLayout,
  type Widget,
  type WidgetSeed,
} from './layout';

export const ROLE_IDS = [
  'trader',
  'industrialist',
  'planetaryIndustry',
  'miner',
  'fighter',
  'explorerHauler',
] as const;
export type RoleId = (typeof ROLE_IDS)[number];

export const ROLES: Record<RoleId, readonly WidgetSeed[]> = {
  // Wallet flow: the Wallet on its Flow, beside the base set's Wallet on its Balance.
  trader: ['orders', 'priceWatch', 'stock', presetSeed('walletFlow'), 'netWorth'],
  industrialist: ['industry', 'profit', 'stock', 'structures'],
  planetaryIndustry: ['planetary'],
  miner: ['miningYield', 'survey', 'miningTax', 'moonChunks'],
  fighter: ['location', 'kills', 'jumpTimers', 'incursions'],
  explorerHauler: ['routeSafety', 'hauling', 'incursions', 'location'],
};

/** Always included, whatever the answer. */
export const BASE_KINDS: readonly WidgetKindId[] = ['wallet', 'training', 'comingUp', 'mail'];

/** `r1`, `r2`, ...: stable ids for layouts built without a caller's makeId. */
export function seqId(prefix: string): MakeId {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function fromKinds(seeds: readonly WidgetSeed[], makeId: MakeId): OverviewLayout {
  const widgets: Widget[] = [];
  const seen = new Set<string>();
  for (const seed of seeds) {
    const kind = seedKind(seed);
    // One widget per kind and Show: the base Wallet and a Role's Wallet flow both stay.
    const key = typeof seed === 'string' ? kind : `${kind}:${seed.show ?? ''}`;
    if (seen.has(key) || !isAddable(kind) || widgets.length >= MAX_WIDGETS) continue;
    seen.add(key);
    const w = seedWidget(seed, makeId());
    if (w) widgets.push(w);
  }
  return { version: 1, widgets };
}

/** Base kinds first, then each chosen role's kinds in order, deduped, coming-soon left out. */
export function buildLayoutFromRoles(
  roles: readonly RoleId[],
  makeId: MakeId = seqId('r')
): OverviewLayout {
  const kinds: WidgetSeed[] = [...BASE_KINDS];
  for (const role of roles) kinds.push(...(ROLES[role] ?? []));
  return fromKinds(kinds, makeId);
}

/** "Just the basics". */
export function basicsLayout(makeId: MakeId = seqId('r')): OverviewLayout {
  return fromKinds(BASE_KINDS, makeId);
}

/**
 * The board a pilot gets from Reset: the mockup's order, minus kinds that are
 * not built yet. Each widget opens at its kind's own default size and view
 * (`kinds.ts`), so Reset and a fresh add agree.
 */
const DEFAULT_BOARD: readonly WidgetKindId[] = [
  'wallet',
  'training',
  'netWorth',
  'orders',
  'industry',
  'planetary',
  'profit',
  'priceWatch',
  'comingUp',
  'mail',
  'lp',
  'stock',
];

export function defaultLayout(makeId: MakeId = seqId('d')): OverviewLayout {
  return fromKinds(DEFAULT_BOARD, makeId);
}
