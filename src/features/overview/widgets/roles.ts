/**
 * First-run Roles: the answer to "What do you do in EVE?" and the Widget Kinds
 * each one brings. Pure data plus the builders that turn an answer (or none)
 * into an Overview Layout.
 */
import { isAddable, type WidgetKindId, type WidgetSize, type WidgetView } from './kinds';
import { MAX_WIDGETS, newWidget, type MakeId, type OverviewLayout, type Widget } from './layout';

export const ROLE_IDS = [
  'trader',
  'industrialist',
  'planetaryIndustry',
  'miner',
  'fighter',
  'explorerHauler',
] as const;
export type RoleId = (typeof ROLE_IDS)[number];

export const ROLES: Record<RoleId, readonly WidgetKindId[]> = {
  trader: ['orders', 'priceWatch', 'stock', 'walletFlow', 'netWorth'],
  industrialist: ['industry', 'profit', 'stock', 'structures'],
  planetaryIndustry: ['planetary'],
  miner: ['miningYield', 'survey', 'miningTax', 'moonChunks'],
  fighter: ['location', 'kills', 'jumpTimers', 'incursions'],
  explorerHauler: ['routeSafety', 'hauling', 'incursions', 'location'],
};

/** Always included, whatever the answer. */
export const BASE_KINDS: readonly WidgetKindId[] = ['wallet', 'training', 'comingUp', 'mail'];

/** `r1`, `r2`, ...: stable ids for layouts built without a caller's makeId. */
function seqId(prefix: string): MakeId {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function fromKinds(kinds: readonly WidgetKindId[], makeId: MakeId): OverviewLayout {
  const widgets: Widget[] = [];
  const seen = new Set<WidgetKindId>();
  for (const kind of kinds) {
    if (seen.has(kind) || !isAddable(kind) || widgets.length >= MAX_WIDGETS) continue;
    seen.add(kind);
    const w = newWidget(kind, makeId());
    if (w) widgets.push(w);
  }
  return { version: 1, widgets };
}

/** Base kinds first, then each chosen role's kinds in order, deduped, coming-soon left out. */
export function buildLayoutFromRoles(
  roles: readonly RoleId[],
  makeId: MakeId = seqId('r')
): OverviewLayout {
  const kinds: WidgetKindId[] = [...BASE_KINDS];
  for (const role of roles) kinds.push(...(ROLES[role] ?? []));
  return fromKinds(kinds, makeId);
}

/** "Just the basics". */
export function basicsLayout(makeId: MakeId = seqId('r')): OverviewLayout {
  return fromKinds(BASE_KINDS, makeId);
}

/**
 * The board a pilot gets from Reset: the mockup's default, minus kinds that are
 * not built yet. Sizes and views are the mockup's, except Price watch, which has
 * no Chart view (the poller keeps no price history) and so opens as a List.
 */
const DEFAULT_BOARD: readonly [WidgetKindId, WidgetSize, WidgetView][] = [
  ['wallet', 'S', 'number'],
  ['training', 'S', 'number'],
  ['netWorth', 'S', 'chart'],
  ['orders', 'M', 'chart'],
  ['industry', 'M', 'list'],
  ['planetary', 'M', 'chart'],
  ['profit', 'M', 'chart'],
  ['priceWatch', 'M', 'list'],
  ['comingUp', 'S', 'number'],
  ['mail', 'S', 'number'],
  ['lp', 'S', 'number'],
  ['stock', 'M', 'chart'],
];

export function defaultLayout(makeId: MakeId = seqId('d')): OverviewLayout {
  const widgets: Widget[] = [];
  for (const [kind, size, view] of DEFAULT_BOARD) {
    if (!isAddable(kind)) continue;
    const w = newWidget(kind, makeId());
    if (w) widgets.push({ ...w, size, view });
  }
  return { version: 1, widgets };
}
