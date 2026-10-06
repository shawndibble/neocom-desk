import { describe, it, expect } from 'vitest';
import i18n from '@/i18n';
import type { ChainEstimateView } from './chainEstimateModel';
import { chainAssumptions, chainFigureSentence } from './chainEstimateText';
import { productAccessibleName } from './map/mapText';
import type { MapProduct, ProductFigure } from './map/mapModel';

const t = i18n.t.bind(i18n);

const view: ChainEstimateView = {
  typeId: 2869,
  iskPerDay: 4_262_069.4,
  unitsPerDay: 4.9,
  planets: ['barren', 'barren', 'temperate', 'gas', 'lava'],
  hostType: 'barren',
  m3PerWeek: 1_234.4,
  m3PerHaul: 529,
  haulDays: 3,
  ccLevel: 4,
  ccAssumed: true,
  rateSource: 'assumed',
  linkCost: 'assumed',
  headsPerExtractor: 8,
  ratePerHour: 4_800,
};

describe('chain estimate wording', () => {
  it('names the figure as a multi-planet estimate that needs hauling, in whole ISK', () => {
    expect(chainFigureSentence(t, view)).toBe(
      'Multi-planet estimate, needs hauling: about 4,262,069 ISK a day across 5 planets'
    );
  });

  it('says every assumption: planets, factory planet, CC level, rate, market and hauling cadence', () => {
    const text = chainAssumptions(t, view);
    expect(text).toContain('5 new planets (2× Barren, Temperate, Gas, Lava)');
    expect(text).toContain('factories on the Barren one');
    expect(text).toContain('level 4 Command Center (assumed');
    expect(text).toContain('8 heads pull about 4,800 units an hour');
    expect(text).toContain('your sell market');
    expect(text).toContain('1,234 m³ a week: 529 m³ a trip at your haul every 3 days');
  });

  it("gives a P4 tile's screen-reader name the estimate and the multi-planet wording", () => {
    const product: MapProduct = {
      typeId: 2869,
      name: 'Nano-Factory',
      tier: 4,
      inputs: [],
      raws: [],
      hosts: ['barren', 'temperate'],
      facility: 'highTech',
    };
    const figure: ProductFigure = { kind: 'unranked', reason: 'tier', chain: view };
    const name = productAccessibleName(t, product, figure, {
      rank: null,
      unlockedBy: null,
      traced: false,
    });
    expect(name).toContain('Multi-planet estimate, needs hauling');
    expect(name).toContain('4,262,069 ISK a day across 5 planets');
  });
});
