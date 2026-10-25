import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { GALLERY_PRESETS, PRESET_KINDS, presetSeed, presetsOf } from './galleryPresets';
import { sampleView } from './gallerySamples';
import { getKind } from './kinds';
import { seedWidget } from './layout';

describe('Gallery presets', () => {
  it('keeps the retired wallet kinds findable as presets of the kind they folded into', () => {
    expect(presetsOf('wallet').map((p) => p.id)).toEqual(['walletFlow']);
    expect(presetsOf('corpWallet').map((p) => p.id)).toEqual(['corpCashFlow', 'corpIncome']);
    expect(presetsOf('marketTrend').map((p) => p.id)).toEqual(['plex', 'injector']);
    expect([...PRESET_KINDS].sort()).toEqual(['corpWallet', 'marketTrend', 'wallet']);
  });

  it('opens each Show preset as its old kind opened: same view and size', () => {
    expect(seedWidget(presetSeed('walletFlow'), 'a')).toMatchObject({
      kind: 'wallet',
      show: 'flow',
      view: 'chart',
      size: 'M',
      range: 30,
    });
    expect(seedWidget(presetSeed('corpCashFlow'), 'a')).toMatchObject({
      kind: 'corpWallet',
      show: 'flow',
      view: 'chart',
      size: 'M',
    });
    expect(seedWidget(presetSeed('corpIncome'), 'a')).toMatchObject({
      kind: 'corpWallet',
      show: 'sources',
      view: 'table',
    });
  });

  it('gives every preset a known kind, a view it has and a Gallery sample', () => {
    const t = ((key: string) => key) as unknown as TFunction;
    for (const p of GALLERY_PRESETS) {
      const kind = getKind(p.kind)!;
      expect(kind, p.id).toBeDefined();
      if (p.init.view) expect(kind.views, p.id).toContain(p.init.view);
      if (p.init.show) expect(kind.shows, p.id).toContain(p.init.show);
      expect(sampleView(p.sample, t), p.id).toBeDefined();
    }
  });
});
