import type { CorpCapabilities } from '@/engine/corpRoles';
import { presetSeed } from './galleryPresets';
import { getKind, isAddable, kindOpenTo, type WidgetKindDef, type WidgetKindId } from './kinds';
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
  trader: ['orders', 'priceWatch', 'stock', presetSeed('walletFlow'), 'netWorth'],
  industrialist: ['industry', 'profit', 'stock', 'structures'],
  planetaryIndustry: ['planetary'],
  miner: ['miningYield', 'survey', 'miningTax', 'moonChunks'],
  fighter: ['location', 'kills', 'jumpTimers', 'incursions'],
  explorerHauler: ['routeSafety', 'hauling', 'incursions', 'location'],
};

export const BASE_KINDS: readonly WidgetKindId[] = ['wallet', 'training', 'comingUp', 'mail'];

export function seqId(prefix: string): MakeId {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function fromSeeds(
  seeds: readonly WidgetSeed[],
  makeId: MakeId,
  canDraw: (kind: WidgetKindDef) => boolean = () => true
): OverviewLayout {
  const widgets: Widget[] = [];
  const seen = new Set<string>();
  for (const seed of seeds) {
    const kind = seedKind(seed);
    const key = typeof seed === 'string' ? kind : `${kind}:${seed.show ?? ''}`;
    const def = getKind(kind);
    if (seen.has(key) || !def || !isAddable(kind) || !canDraw(def)) continue;
    if (widgets.length >= MAX_WIDGETS) break;
    seen.add(key);
    const w = seedWidget(seed, makeId());
    if (w) widgets.push(w);
  }
  return { version: 1, widgets };
}

export function buildLayoutFromRoles(
  roles: readonly RoleId[],
  held: CorpCapabilities | null,
  makeId: MakeId = seqId('r')
): OverviewLayout {
  const kinds: WidgetSeed[] = [...BASE_KINDS];
  for (const role of roles) kinds.push(...(ROLES[role] ?? []));
  return fromSeeds(kinds, makeId, (kind) => kindOpenTo(kind, held));
}

export function basicsLayout(makeId: MakeId = seqId('r')): OverviewLayout {
  return fromSeeds(BASE_KINDS, makeId);
}

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
  return fromSeeds(DEFAULT_BOARD, makeId);
}
