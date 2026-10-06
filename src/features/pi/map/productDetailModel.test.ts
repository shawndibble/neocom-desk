import { describe, expect, it } from 'vitest';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { pi } from './mapFixtures.testutil';
import { buildMapGraph, traceProduct, type ProductFigure } from './mapModel';
import { buildProductDetail, type ProductDetailInput } from './productDetailModel';

const graph = buildMapGraph(pi);
const BIOFUELS = 2396;
const CARBON_COMPOUNDS = 2288;
const COOLANT = 9832;
const ELECTROLYTES = 2390;
const WATER = 3645;
const ROBOTICS = 9848;
const BROADCAST_NODE = 2867;

const ranked: ProductFigure = {
  kind: 'ranked',
  iskPerDay: 717_234,
  m3PerDay: 182.4,
  useType: 'temperate',
  hostTypes: ['temperate'],
  haveTypes: ['temperate'],
  verdict: 'better',
  isReference: false,
  versus: null,
};

function input(
  typeId: number,
  overrides: Partial<ProductDetailInput> = {},
  owned: PlanetType[] = ['temperate']
): ProductDetailInput {
  const set = new Set(owned);
  return {
    graph,
    typeId,
    trace: traceProduct(graph, typeId, { owned: set, ticked: set }),
    figure: { kind: 'unranked', reason: 'tier' },
    colonies: [],
    ccLevel: 4,
    ...overrides,
  };
}

describe('buildProductDetail: how to make it', () => {
  it('names the direct inputs, the factory and the planet types that carry it', () => {
    const view = buildProductDetail(input(COOLANT));
    expect(view.tier).toBe(2);
    expect(view.facility).toBe('advanced');
    expect(view.inputs.map((i) => i.name)).toEqual(['Electrolytes', 'Water']);
    expect(view.hosts).toHaveLength(8);
  });

  it('says a P1 runs in a basic factory and a P4 only where a high-tech plant goes', () => {
    expect(buildProductDetail(input(BIOFUELS)).facility).toBe('basic');
    const node = buildProductDetail(input(BROADCAST_NODE));
    expect(node.facility).toBe('highTech');
    expect(node.hosts).toEqual(['barren', 'temperate']);
  });

  it('says a raw material is extracted, from which planet types, with no inputs', () => {
    const view = buildProductDetail(input(CARBON_COMPOUNDS));
    expect(view.tier).toBe(0);
    expect(view.facility).toBe('extractor');
    expect(view.inputs).toEqual([]);
    expect(view.hosts).toEqual(['barren', 'oceanic', 'temperate']);
    expect(view.money).toEqual({ kind: 'raw' });
  });

  it('says one planet is enough when one type yields every raw and hosts the factory', () => {
    const view = buildProductDetail(input(BIOFUELS));
    expect(view.onePlanet).toBe(true);
    expect(view.planets).toBe(1);
  });

  it('counts the planets a P4 needs between them', () => {
    const node = buildProductDetail(input(BROADCAST_NODE));
    expect(node.onePlanet).toBe(false);
    expect(node.planets).toBeGreaterThan(1);
  });
});

describe('buildProductDetail: why or why not', () => {
  it("passes the model's one-planet figure through, with its hauling load and the CC level it assumes", () => {
    const view = buildProductDetail(input(BIOFUELS, { figure: ranked, ccLevel: 4 }));
    expect(view.money).toEqual({
      kind: 'one-planet',
      iskPerDay: 717_234,
      useType: 'temperate',
      m3PerDay: 182.4,
      ccLevel: 4,
    });
  });

  it('marks a P3 or P4 as multi-planet with the planet count, never a one-planet figure', () => {
    const view = buildProductDetail(input(ROBOTICS));
    expect(view.money).toEqual({ kind: 'multi-planet', planets: view.planets });
  });

  it('marks a P1 or P2 that no one planet makes as multi-planet too', () => {
    const view = buildProductDetail(
      input(COOLANT, { figure: { kind: 'unranked', reason: 'not-one-planet' } })
    );
    expect(view.money.kind).toBe('multi-planet');
  });

  it('says unpriced, never zero, when the hub has no price', () => {
    const view = buildProductDetail(
      input(BIOFUELS, { figure: { kind: 'unranked', reason: 'unpriced' } })
    );
    expect(view.money).toEqual({ kind: 'unpriced' });
  });

  it('says a one-planet product that fits nowhere has no figure', () => {
    const view = buildProductDetail(
      input(BIOFUELS, { figure: { kind: 'unranked', reason: 'no-fit' } })
    );
    expect(view.money).toEqual({ kind: 'no-fit' });
  });
});

describe("buildProductDetail: what the pilot's colonies already make", () => {
  it('lists the inputs anywhere in the chain a colony sells today, with the colonies', () => {
    const view = buildProductDetail(
      input(COOLANT, {
        colonies: [
          { name: 'Hek VIII', sells: [WATER] },
          { name: 'Hek IX', sells: [WATER, BIOFUELS] },
          { name: 'Uttindar V', sells: [ELECTROLYTES] },
        ],
      })
    );
    expect(view.ownInputs).toEqual([
      { typeId: ELECTROLYTES, name: 'Electrolytes', colonies: ['Uttindar V'] },
      { typeId: WATER, name: 'Water', colonies: ['Hek VIII', 'Hek IX'] },
    ]);
    expect(view.makingIt).toEqual([]);
  });

  it('says which colonies already make the product itself', () => {
    const view = buildProductDetail(
      input(COOLANT, { colonies: [{ name: 'Hek VIII', sells: [COOLANT] }] })
    );
    expect(view.makingIt).toEqual(['Hek VIII']);
    expect(view.ownInputs).toEqual([]);
  });
});
