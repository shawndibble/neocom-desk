import { describe, expect, it } from 'vitest';
import {
  alternativeSource,
  priceFix,
  rankSources,
  usableSource,
  type LpOfferInput,
  type SourceContext,
} from './implantSources';

const TAG = 500;

function context(over: Partial<SourceContext> = {}): SourceContext {
  return {
    selectedHubId: 'jita',
    hubPrices: () => [{ hubId: 'jita', sellMin: 10_000_000, sellVolume: 4 }],
    turnInPrice: () => 1_000_000,
    lpRate: () => 1_000,
    lpBalance: () => 10_000,
    owned: () => 0,
    ...over,
  };
}

const offer = (over: Partial<LpOfferInput> = {}): LpOfferInput => ({
  corporationId: 1,
  corpName: 'Caldari Navy',
  iskCost: 1_000_000,
  lpCost: 4_000,
  quantity: 1,
  requiredItems: [],
  ...over,
});

describe('rankSources', () => {
  it('buys at the selected hub when that is all there is', () => {
    const [source] = rankSources(1, [], context());
    expect(source).toMatchObject({ kind: 'market', hubId: 'jita', cost: 10_000_000 });
  });

  it('puts an affordable LP offer first when ISK + LP × its rate is cheaper', () => {
    // 1M ISK + 4,000 LP × 1,000 = 5M, against 10M at Jita.
    const sources = rankSources(1, [offer()], context());
    expect(sources.map((s) => [s.kind, s.cost])).toEqual([
      ['lp', 5_000_000],
      ['market', 10_000_000],
    ]);
  });

  it('prices the tags still to buy into the offer, and only those', () => {
    const sources = rankSources(
      1,
      [offer({ requiredItems: [{ typeId: TAG, quantity: 2 }] })],
      context({ owned: () => 1 })
    );
    expect(sources[0]).toMatchObject({
      kind: 'lp',
      cost: 6_000_000,
      turnIns: [{ typeId: TAG, quantity: 2, owned: 1, toBuy: 1, unitPrice: 1_000_000 }],
      blocked: false,
    });
  });

  it('sinks an offer the pilot lacks the LP for below what they can buy, saying how short', () => {
    const sources = rankSources(1, [offer()], context({ lpBalance: () => 3_200 }));
    expect(sources.map((s) => s.kind)).toEqual(['market', 'lp']);
    expect(sources[1]).toMatchObject({ blocked: true, lpShort: 800 });
  });

  it('blocks an offer whose tag nobody sells, and names it', () => {
    const sources = rankSources(
      1,
      [offer({ requiredItems: [{ typeId: TAG, quantity: 1 }] })],
      context({ turnInPrice: () => null })
    );
    expect(sources[1]).toMatchObject({
      kind: 'lp',
      blocked: true,
      unbuyable: [{ typeId: TAG, toBuy: 1 }],
    });
  });

  it('leaves an offer whose LP nothing prices unpriced — after what has a price, never free', () => {
    const sources = rankSources(1, [offer()], context({ lpRate: () => null }));
    expect(sources.map((s) => [s.kind, s.cost])).toEqual([
      ['market', 10_000_000],
      ['lp', null],
    ]);
    expect(sources[1]).toMatchObject({ blocked: false });
  });

  it('does not block on an LP balance it can’t see', () => {
    const [source] = rankSources(1, [offer()], context({ lpBalance: () => null }));
    expect(source).toMatchObject({ kind: 'lp', blocked: false, balanceKnown: false });
  });

  it('costs an offer per unit when one redemption hands out several', () => {
    const [source] = rankSources(1, [offer({ quantity: 2 })], context());
    expect(source).toMatchObject({ kind: 'lp', cost: 2_500_000 });
  });

  it('falls back to the cheapest other hub, and to nothing at all', () => {
    const elsewhere = rankSources(
      1,
      [],
      context({
        hubPrices: () => [
          { hubId: 'jita', sellMin: null, sellVolume: 0 },
          { hubId: 'amarr', sellMin: 12_000_000, sellVolume: 2 },
        ],
      })
    );
    expect(elsewhere[0]).toMatchObject({ kind: 'market', hubId: 'amarr', atSelectedHub: false });
    expect(rankSources(1, [], context({ hubPrices: () => [] }))).toEqual([]);
  });
});

describe('priceFix', () => {
  it('prices each implant at its best source the pilot can actually use', () => {
    const fix = priceFix([1, 2], (id) => (id === 1 ? [offer()] : []), context());
    expect(fix).toMatchObject({ cost: 15_000_000 });
    expect(fix!.sources.map((s) => s.kind)).toEqual(['lp', 'market']);
  });

  it('spends one store’s LP once across the whole fix', () => {
    // 6,000 LP buys one 4,000-LP offer; the second implant goes to market.
    const fix = priceFix([1, 2], () => [offer()], context({ lpBalance: () => 6_000 }));
    expect(fix!.sources.map((s) => s.kind)).toEqual(['lp', 'market']);
    expect(fix!.cost).toBe(15_000_000);
  });

  it('lets one owned tag cover one offer, not two', () => {
    const withTag = offer({ requiredItems: [{ typeId: TAG, quantity: 1 }] });
    const fix = priceFix([1, 2], () => [withTag], context({ owned: (id) => (id === TAG ? 1 : 0) }));
    // First: 5M (tag owned). Second: 5M + 1M for the tag it has to buy.
    expect(fix!.cost).toBe(11_000_000);
  });

  it('is no fix when an implant can’t be had at all', () => {
    expect(priceFix([1], () => [], context({ hubPrices: () => [] }))).toBeNull();
  });
});

describe('alternativeSource', () => {
  it('points to a cheaper offer the pilot can’t redeem yet', () => {
    const sources = rankSources(1, [offer()], context({ lpBalance: () => 3_200 }));
    const best = usableSource(sources)!;
    expect(alternativeSource(sources, best)).toMatchObject({
      source: { kind: 'lp', blocked: true },
      cheaperIfYouCould: true,
    });
  });

  it('otherwise offers the next way to get it, as a plain alternative', () => {
    const sources = rankSources(1, [offer()], context());
    const best = usableSource(sources)!;
    expect(alternativeSource(sources, best)).toMatchObject({
      source: { kind: 'market' },
      cheaperIfYouCould: false,
    });
  });

  it('when nothing is usable, the first source leads and nothing is "cheaper"', () => {
    const sources = rankSources(1, [offer()], context({ lpBalance: () => 0, hubPrices: () => [] }));
    expect(usableSource(sources)).toBeNull();
    expect(alternativeSource(sources, sources[0]!)).toBeNull();
  });
});
