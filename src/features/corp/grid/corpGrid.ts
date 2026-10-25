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
import type { CorpCapabilities } from '@/engine/corpRoles';
import type { WidgetBoard } from '@/features/overview/widgets/board';
import {
  boardKinds,
  CORP_KIND_CATEGORIES,
  isAddable,
  kindOpenTo,
  type WidgetKindDef,
  type WidgetKindId,
} from '@/features/overview/widgets/kinds';
import {
  MAX_WIDGETS,
  newWidget,
  type MakeId,
  type OverviewLayout,
  type Widget,
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
export const CORP_DEFAULT_KINDS: readonly WidgetKindId[] = [
  'corpDeadlines',
  'structures',
  'moonChunks',
  'corpJobs',
  'corpWallet',
  'corpCashFlow',
  'corpMembers',
  'corpInactive',
  'corpIncome',
  'corpMining',
];

export function corpDefaultLayout(makeId: MakeId = seqId('c')): OverviewLayout {
  const widgets: Widget[] = [];
  for (const id of CORP_DEFAULT_KINDS) {
    if (!isAddable(id) || widgets.length >= MAX_WIDGETS) continue;
    const widget = newWidget(id, makeId());
    if (widget) widgets.push(widget);
  }
  return { version: 1, widgets };
}

const CORP_KINDS = boardKinds('corp');

export function corpWidgetBoard(capabilities: CorpCapabilities): WidgetBoard {
  return {
    id: 'corp',
    kinds: CORP_KINDS,
    categories: CORP_KIND_CATEGORIES,
    canDraw: (kind: WidgetKindDef) => kindOpenTo(kind, capabilities),
    characterScope: false,
    defaultLayout: corpDefaultLayout,
  };
}
