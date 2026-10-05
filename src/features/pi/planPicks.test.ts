import { describe, it, expect } from 'vitest';
import { buildPlanAdvice } from './planAdviceModel';
import { planPicks } from './planPicks';
import { adviceInput } from './map/mapFixtures.testutil';

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
});
