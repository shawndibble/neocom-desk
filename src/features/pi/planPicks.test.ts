import { describe, it, expect } from 'vitest';
import { buildPlanAdvice } from './planAdviceModel';
import { planPicks } from './planPicks';
import { adviceInput, pi } from './map/mapFixtures.testutil';
import { buildFindBestView } from './findBestView';
import { planetTypesOf } from './productPlanets';
import { buildMapGraph, productFigure } from './map/mapModel';

describe('planPicks', () => {
  it('lists each distinct rebuild once, biggest total gain first, at most three', () => {
    const advice = buildPlanAdvice(adviceInput('lean'));
    const picks = planPicks(advice);
    expect(picks.kind).toBe('rebuild');
    expect(picks.picks.length).toBeGreaterThan(0);
    expect(picks.picks.length).toBeLessThanOrEqual(3);
    const gains = picks.picks.map((p) => p.perDay);
    expect(gains).toEqual([...gains].sort((a, b) => b - a));
    const colony = advice.colonies[0];
    if (colony.rebuild.status !== 'change') throw new Error('fixture should rebuild');
    expect(picks.picks[0]).toMatchObject({
      typeId: colony.rebuild.pick.typeId,
      perDay: colony.rebuild.gainPerDay,
      planetIds: [colony.planetId],
    });
  });

  it('falls back to the best one-planet recipes when the pilot has no colonies', () => {
    const advice = buildPlanAdvice(adviceInput('none'));
    const picks = planPicks(advice);
    expect(picks.kind).toBe('recipes');
    expect(picks.picks.map((p) => p.typeId)).toEqual(
      advice.recipes.recipes.slice(0, 3).map((r) => r.typeId)
    );
    expect(picks.picks.map((p) => p.perDay)).toEqual(
      advice.recipes.recipes.slice(0, 3).map((r) => r.iskPerDay)
    );
  });

  it('is empty, not a recipe list, when colonies already make their best product', () => {
    const advice = buildPlanAdvice(adviceInput('lean'));
    const keep = {
      ...advice,
      colonies: advice.colonies.map((c) => ({
        ...c,
        rebuild: {
          status: 'keep' as const,
          reason: 'already-best' as const,
          planetId: c.planetId,
          planetType: c.planetType,
          todayPerDay: 0,
          best: null,
          alternative: null,
        },
      })),
    };
    expect(planPicks(keep)).toEqual({ kind: 'none', picks: [] });
  });

  it("does not move when a what-if planet is added: the picks are the pilot's own", () => {
    const base = planPicks(buildPlanAdvice(adviceInput('lean')));
    const whatIf = planPicks(buildPlanAdvice(adviceInput('lean', { whatIfTypes: ['lava'] })));
    expect(whatIf).toEqual(base);
  });

  describe('untrained Command Center (level 0), no colonies', () => {
    const advice = buildPlanAdvice(
      adviceInput('none', {
        skills: { commandCenterUpgrades: 0, interplanetaryConsolidation: null },
      })
    );
    const plan = buildFindBestView({
      rows: advice.recipeRows,
      unpriced: advice.recipes.unpriced,
      colonyTypes: [],
      allTypes: planetTypesOf(pi),
      off: new Set(),
      whatIf: new Set(),
      filter: 'any',
      madeTypeIds: new Set(),
    }).cards.slice(0, 3);

    it("picks the same recipes as Plan's Find best, CC tags included", () => {
      const picks = planPicks(advice);
      expect(picks.kind).toBe('recipes');
      expect(plan.length).toBeGreaterThan(0);
      expect(picks.picks.map((p) => [p.typeId, p.needsCcLevel ?? null])).toEqual(
        plan.map((c) => [c.recipe.typeId, c.recipe.needsCcLevel ?? null])
      );
      expect(picks.picks.some((p) => p.needsCcLevel)).toBe(true);
    });

    it('gives each pick a tile figure carrying the same tag', () => {
      const graph = buildMapGraph(pi);
      for (const card of plan) {
        const figure = productFigure(advice, card.recipe.typeId, graph);
        expect(figure).toMatchObject({
          kind: 'ranked',
          iskPerDay: card.recipe.iskPerDay,
          needsCcLevel: card.recipe.needsCcLevel ?? null,
        });
      }
    });
  });
});
