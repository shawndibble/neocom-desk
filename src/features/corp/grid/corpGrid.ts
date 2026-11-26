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

const OPENS_ON_ALL = [
  'corpDeadlines',
  'structures',
  'moonChunks',
  'corpJobs',
  'corpWallet',
  'corpKills',
  'corpCustomsOffices',
  'corpStarbases',
  'corpSovereignty',
  'corpContracts',
  'corpOrders',
] as const;

const onAll = (kind: (typeof OPENS_ON_ALL)[number]): WidgetSeed => ({ kind, scope: 'all' });

export const CORP_DEFAULT_SEEDS: readonly WidgetSeed[] = [
  onAll('corpDeadlines'),
  onAll('structures'),
  onAll('moonChunks'),
  onAll('corpJobs'),
  onAll('corpWallet'),
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

const CORP_OPENS_ON_ALL: ReadonlySet<string> = new Set(OPENS_ON_ALL);

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
    allScopeOffered: (kind) =>
      corporationsReading !== undefined &&
      corporationsReading(getKind(kind)?.capabilities ?? []) > 1,
    opensOnAll: CORP_OPENS_ON_ALL,
    defaultLayout: corpDefaultLayout,
  };
}
