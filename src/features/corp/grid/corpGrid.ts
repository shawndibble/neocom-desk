/**
 * The Corp Board as a widget board: which kinds it offers, which the
 * Character may see, and the layout it opens with.
 *
 * Pure (no React, Dexie or fetch). The route hands `corpWidgetBoard` the
 * capabilities `useCorpRouteGate` resolved, so the gate that decides what is
 * fetched also decides what is drawn and offered: a widget whose capability
 * is not held is never shown, never fetched and never offered in the Gallery
 * (corp UI hides rather than locks).
 */
import type { CorpCapabilities, CorpCapability } from '@/engine/corpRoles';
import type { WidgetBoard } from '@/features/overview/widgets/board';
import {
  boardKinds,
  CORP_KIND_CATEGORIES,
  getKind,
  isAddable,
  kindOpenTo,
  type WidgetKindDef,
} from '@/features/overview/widgets/kinds';
import { presetSeed } from '@/features/overview/widgets/galleryPresets';
import {
  MAX_WIDGETS,
  seedKind,
  seedWidget,
  type MakeId,
  type OverviewLayout,
  type Widget,
  type WidgetSeed,
} from '@/features/overview/widgets/layout';
import { seqId } from '@/features/overview/widgets/roles';

/**
 * The layout a Corp Board opens with, before the pilot changes anything:
 * when, then money, then people, then the ledgers.
 *
 * Every kind, whatever this Character can read: the board's `canDraw` hides
 * the rest. The layout is one per pilot, so a default trimmed to an alt's
 * roles would, once edited and saved, drop the Director main's widgets on
 * every device.
 */
export const CORP_DEFAULT_SEEDS: readonly WidgetSeed[] = [
  // Every corporation the pilot's Characters can read, once there are two (`allScopeOffered`).
  { kind: 'corpDeadlines', scope: 'all' },
  { kind: 'structures', scope: 'all' },
  'moonChunks',
  'corpJobs',
  'corpWallet',
  // The corp wallet on its Flow and its Sources, opened as Cash flow and Income by source were.
  presetSeed('corpCashFlow'),
  'corpMembers',
  'corpInactive',
  presetSeed('corpIncome'),
  'corpMining',
];

export function corpDefaultLayout(makeId: MakeId = seqId('c')): OverviewLayout {
  const widgets: Widget[] = [];
  for (const seed of CORP_DEFAULT_SEEDS) {
    if (!isAddable(seedKind(seed)) || widgets.length >= MAX_WIDGETS) continue;
    const widget = seedWidget(seed, makeId());
    if (widget) widgets.push(widget);
  }
  return { version: 1, widgets };
}

const CORP_KINDS = boardKinds('corp');

/** Kinds a widget added to the Corp Board opens on All, as the default layout's do. */
const CORP_OPENS_ON_ALL: ReadonlySet<string> = new Set(
  CORP_DEFAULT_SEEDS.flatMap((seed) =>
    typeof seed !== 'string' && seed.scope === 'all' ? [seed.kind] : []
  )
);

/**
 * `corporationsReading` says how many corporations the pilot's Characters can read for any
 * of some capabilities; until it is known (left out), every widget reads its header scope.
 */
export function corpWidgetBoard(
  capabilities: CorpCapabilities,
  corporationsReading?: (capabilities: readonly CorpCapability[]) => number
): WidgetBoard {
  return {
    id: 'corp',
    kinds: CORP_KINDS,
    categories: CORP_KIND_CATEGORIES,
    canDraw: (kind: WidgetKindDef) => kindOpenTo(kind, capabilities),
    characterScope: 'summable',
    // One corporation to read: All would be the same rows, so the choice is not offered. Until
    // the count lands the header scope is read, so a one-corporation pilot never fans out.
    allScopeOffered: (kind) =>
      corporationsReading !== undefined &&
      corporationsReading(getKind(kind)?.capabilities ?? []) > 1,
    opensOnAll: CORP_OPENS_ON_ALL,
    defaultLayout: corpDefaultLayout,
  };
}
