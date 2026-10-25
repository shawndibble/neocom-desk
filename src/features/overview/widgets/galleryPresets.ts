/**
 * The Gallery's presets: cards listed beside their kind's own that add an
 * ordinary widget of that kind with some settings already chosen. Nothing ties
 * the widget to its preset afterwards; the pilot edits it like any other.
 *
 * Two families: Item prices (`trendPresets.ts`, items already picked, the
 * preset's name as the widget's title) and the wallet Shows (`kinds.ts`), which
 * keep Wallet flow, Cash flow and Income by source findable under the names
 * they had as kinds. A Show names its widget itself, so those set no title.
 * Copy: `overview.gallery.presets.<id>.title` and `.desc`.
 */
import type { WidgetKindId } from './kinds';
import type { WidgetInit, WidgetSeed } from './layout';
import { TREND_PRESETS } from './trendPresets';

export interface GalleryPreset {
  id: string;
  kind: WidgetKindId;
  /** What the added widget starts with. */
  init: WidgetInit;
  /** The Gallery sample (`gallerySamples.ts`) its preview draws. */
  sample: string;
  /** The added widget takes the preset's title as its name. */
  titled: boolean;
}

const SHOW_PRESETS: readonly GalleryPreset[] = [
  {
    id: 'walletFlow',
    kind: 'wallet',
    init: { show: 'flow', view: 'chart', size: 'M' },
    sample: 'walletFlow',
    titled: false,
  },
  {
    id: 'corpCashFlow',
    kind: 'corpWallet',
    init: { show: 'flow', view: 'chart' },
    sample: 'corpCashFlow',
    titled: false,
  },
  {
    id: 'corpIncome',
    kind: 'corpWallet',
    init: { show: 'sources', view: 'table' },
    sample: 'corpIncome',
    titled: false,
  },
];

export const GALLERY_PRESETS: readonly GalleryPreset[] = [
  ...TREND_PRESETS.map((p) => ({
    id: p.id,
    kind: 'marketTrend',
    init: { trendItems: p.items, trendHubs: p.trendHubs, view: p.view },
    sample: `marketTrend${p.id.charAt(0).toUpperCase()}${p.id.slice(1)}`,
    titled: true,
  })),
  ...SHOW_PRESETS,
];

/** The presets listed beside `kind`'s card, in catalogue order. */
export function presetsOf(kind: WidgetKindId): readonly GalleryPreset[] {
  return GALLERY_PRESETS.filter((p) => p.kind === kind);
}

/** The kinds that list presets: they stay in the Gallery once on the board, since a preset adds another. */
export const PRESET_KINDS: ReadonlySet<WidgetKindId> = new Set(GALLERY_PRESETS.map((p) => p.kind));

/** A preset as a default layout's or a Role's widget, so they open it as the Gallery would. */
export function presetSeed(id: string): WidgetSeed {
  const preset = GALLERY_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`No Gallery preset ${id}`);
  return { kind: preset.kind, ...preset.init };
}
