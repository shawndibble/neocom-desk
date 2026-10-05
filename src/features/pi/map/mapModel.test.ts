import { describe, it, expect } from 'vitest';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { buildPlanAdvice } from '../planAdviceModel';
import { adviceInput, pi } from './mapFixtures';
import {
  buildMapGraph,
  canMake,
  detailMode,
  productFigure,
  traceProduct,
  unlockedBy,
  unlockedRecipe,
  DOCK_MIN_PANEL_WIDTH,
} from './mapModel';

const graph = buildMapGraph(pi);
const id = (name: string) => {
  const hit = [...graph.byId.values()].find((p) => p.name === name);
  if (!hit) throw new Error(`no ${name}`);
  return hit.typeId;
};
const set = (...types: PlanetType[]): ReadonlySet<PlanetType> => new Set(types);

describe('buildMapGraph', () => {
  it('has the six columns of the real graph, P1 in the order of its raw', () => {
    expect(graph.tiers[0].length).toBe(pi.raw.length);
    expect(graph.tiers[1].length).toBe(pi.raw.length);
    expect(graph.tiers[0].map((p) => p.name)).toEqual(
      [...graph.tiers[0].map((p) => p.name)].sort((a, b) => a.localeCompare(b))
    );
    graph.tiers[1].forEach((p, i) => expect(p.inputs).toEqual([graph.tiers[0][i].typeId]));
    expect(graph.tiers[4].length).toBeGreaterThan(0);
    expect(graph.planetTypes).toHaveLength(8);
  });
});

describe('canMake', () => {
  it('needs every raw under it from the ticked planet types', () => {
    const coolant = id('Coolant');
    expect(canMake(graph, coolant, set('temperate', 'barren'))).toBe(false);
    expect(
      canMake(
        graph,
        coolant,
        set('barren', 'gas', 'ice', 'lava', 'oceanic', 'plasma', 'storm', 'temperate')
      )
    ).toBe(true);
    expect(canMake(graph, id('Water'), set('oceanic'))).toBe(true);
    expect(canMake(graph, id('Water'), set('lava'))).toBe(false);
  });

  it('needs a host for a P4 on top of its raws', () => {
    const p4 = graph.tiers[4][0];
    const noHost = new Set(
      graph.planetTypes.filter((t) => !pi.schematics[p4.typeId].planetTypes.includes(t))
    );
    expect(canMake(graph, p4.typeId, noHost)).toBe(false);
    expect(canMake(graph, p4.typeId, new Set(graph.planetTypes))).toBe(true);
  });
});

describe('unlockedBy', () => {
  it('lists what a planet type adds over the ticked ones, and counts only products', () => {
    const ticked = set('barren', 'temperate');
    const added = unlockedBy(graph, 'lava', ticked);
    expect(added.productIds.every((pid) => graph.byId.get(pid)!.tier >= 1)).toBe(true);
    expect(added.productIds.every((pid) => !canMake(graph, pid, ticked))).toBe(true);
    expect(
      added.productIds.every((pid) => canMake(graph, pid, new Set<PlanetType>([...ticked, 'lava'])))
    ).toBe(true);
    expect(added.productIds.length).toBeGreaterThan(0);
    // The raws it yields light too, but are not "products".
    expect(added.highlight.size).toBeGreaterThan(added.productIds.length);
  });

  it('adds nothing when the type is already ticked', () => {
    expect(unlockedBy(graph, 'barren', set('barren')).productIds).toEqual([]);
  });
});

describe('traceProduct', () => {
  it('walks a P2 back to the P1s and P0s it needs, with the wires between them', () => {
    const trace = traceProduct(graph, id('Coolant'), { owned: set('gas'), ticked: set('gas') });
    expect(trace.ids.has(id('Coolant'))).toBe(true);
    expect([...trace.ids].some((pid) => graph.byId.get(pid)!.tier === 0)).toBe(true);
    for (const [from, to] of trace.edges) {
      expect(graph.byId.get(to)!.inputs).toContain(from);
    }
  });

  it('prefers planet types the pilot has, and marks the ones they still need', () => {
    const product = id('Coolant');
    const trace = traceProduct(graph, product, {
      owned: set('temperate'),
      ticked: set('temperate'),
    });
    const types = trace.planets.map((p) => p.type);
    expect(types.length).toBeGreaterThan(0);
    for (const p of trace.planets) expect(p.have).toBe(p.type === 'temperate');
    // Every raw under the product is assigned to exactly one planet type of the cover.
    const raws = new Set(trace.planets.flatMap((p) => p.raws));
    expect(raws).toEqual(new Set([...trace.ids].filter((pid) => graph.byId.get(pid)!.tier === 0)));
  });

  it('builds a pick on the planet type the pick names, not just any one the pilot has', () => {
    const water = id('Water');
    const trace = traceProduct(graph, water, {
      owned: set('barren', 'oceanic'),
      ticked: set('barren', 'oceanic'),
      prefer: ['oceanic'],
    });
    expect(trace.planets.map((p) => p.type)).toEqual(['oceanic']);
  });

  it('names every one-planet host when one planet can do it all', () => {
    const water = traceProduct(graph, id('Water'), { owned: set(), ticked: set() });
    expect(water.planets).toHaveLength(1);
    expect(water.alternatives.length).toBeGreaterThan(1);
    expect(water.alternatives).toContain(water.planets[0].type);
  });

  it('puts a P4 on a Barren or Temperate host', () => {
    const p4 = graph.tiers[4][0].typeId;
    const trace = traceProduct(graph, p4, { owned: set('gas'), ticked: set('gas') });
    expect(trace.planets.some((p) => pi.schematics[p4].planetTypes.includes(p.type))).toBe(true);
  });

  it('reads as a chain: planet, raw, processed, up to the product', () => {
    const trace = traceProduct(graph, id('Water'), {
      owned: set('oceanic'),
      ticked: set('oceanic'),
    });
    const [planet] = trace.planets;
    expect(planet.type).toBe('oceanic');
    expect(planet.made.map((p) => graph.byId.get(p)!.tier)).toEqual([0, 1]);
  });
});

describe('productFigure: the same numbers as the recommendation model', () => {
  const advice = buildPlanAdvice(adviceInput('lean'));
  it('reads a P1/P2 straight off the ranked recipes', () => {
    const recipe = advice.recipes.recipes[0];
    const fig = productFigure(advice, recipe.typeId, graph);
    expect(fig).toMatchObject({
      kind: 'ranked',
      iskPerDay: recipe.iskPerDay,
      useType: recipe.useType,
    });
    if (fig.kind === 'ranked') expect(fig.verdict).toBe(recipe.comparison?.verdict);
  });

  it('has no figure for P3 and P4, and says why', () => {
    expect(productFigure(advice, graph.tiers[3][0].typeId, graph)).toEqual({
      kind: 'unranked',
      reason: 'tier',
    });
    expect(productFigure(advice, graph.tiers[4][0].typeId, graph)).toEqual({
      kind: 'unranked',
      reason: 'tier',
    });
  });

  it('has no figure for raw, and none rather than zero for a P2 no single planet can make', () => {
    expect(productFigure(advice, graph.tiers[0][0].typeId, graph)).toEqual({
      kind: 'unranked',
      reason: 'raw',
    });
    const ranked = new Set(advice.recipes.recipes.map((r) => r.typeId));
    const orphan = graph.tiers[2].find((p) => !ranked.has(p.typeId));
    if (orphan)
      expect(productFigure(advice, orphan.typeId, graph)).toMatchObject({ kind: 'unranked' });
  });
});

describe('unlockedRecipe', () => {
  it('is the best recipe only the new planet type can host, priced for that type', () => {
    const base = buildPlanAdvice(adviceInput('lean'));
    const whatIf = buildPlanAdvice(adviceInput('lean', { whatIfTypes: ['lava'] }));
    const best = unlockedRecipe(whatIf, 'lava', ['temperate']);
    expect(best).not.toBeNull();
    expect(best!.useType).toBe('lava');
    expect(best!.hostTypes).toContain('lava');
    expect(best!.hostTypes).not.toContain('temperate');
    // Not already a recipe the pilot's own planets host.
    expect(base.recipes.recipes.find((r) => r.typeId === best!.typeId)?.haveTypes ?? []).toEqual(
      []
    );
    for (const r of whatIf.recipes.recipes) {
      if (r.hostTypes.includes('lava') && !r.hostTypes.includes('temperate')) {
        expect(r.iskPerDay).toBeLessThanOrEqual(best!.iskPerDay);
      }
    }
  });
});

describe('detailMode', () => {
  it('docks beside the map only when the map panel itself is wide enough', () => {
    expect(detailMode({ panelWidth: DOCK_MIN_PANEL_WIDTH, phone: false })).toBe('docked');
    expect(detailMode({ panelWidth: DOCK_MIN_PANEL_WIDTH - 1, phone: false })).toBe('drawer');
    expect(detailMode({ panelWidth: 2400, phone: true })).toBe('sheet');
  });
});
