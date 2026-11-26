import type { WidgetKindId } from './kinds';
import type { WidgetInit, WidgetSeed } from './layout';
import { TREND_PRESETS } from './trendPresets';

export interface GalleryPreset {
  id: string;
  kind: WidgetKindId;
  init: WidgetInit;
  sample: string;
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

export function presetsOf(kind: WidgetKindId): readonly GalleryPreset[] {
  return GALLERY_PRESETS.filter((p) => p.kind === kind);
}

export const PRESET_KINDS: ReadonlySet<WidgetKindId> = new Set(GALLERY_PRESETS.map((p) => p.kind));

export function presetSeed(id: string): WidgetSeed {
  const preset = GALLERY_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`No Gallery preset ${id}`);
  return { kind: preset.kind, ...preset.init };
}
