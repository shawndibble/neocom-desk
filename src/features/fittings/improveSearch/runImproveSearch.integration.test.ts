import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Fitting } from '@/engine/fittings/types';
import { FIT_TOTAL, loadImproveSearchWorld, PRICE } from '../__fixtures__/improveSearchWorld';
import { runImproveSearch, type ImproveOutcome, type ImproveRequest } from '.';

type World = Awaited<ReturnType<typeof loadImproveSearchWorld>>;
let world: World;

beforeAll(async () => {
  world = await loadImproveSearchWorld();
});
afterAll(() => vi.unstubAllGlobals());

const RIFTER = {
  low: ['Damage Control I', '200mm Steel Plates I'],
  medium: ['1MN Afterburner I'],
};

async function run(
  fitting: Fitting,
  request: ImproveRequest,
  shouldStop: (seen: { makeover: boolean }) => boolean = () => false,
  ports = world.ports(fitting)
) {
  const seen = { baseline: false, makeover: false, progress: 0 };
  const outcome = await runImproveSearch(request, ports, {
    signal: new AbortController().signal,
    onBaseline: () => (seen.baseline = true),
    onProgress: (progress) => {
      seen.progress++;
      if (progress.makeover) seen.makeover = true;
    },
    shouldStop: () => shouldStop(seen),
  });
  return { outcome, seen };
}

const done = (outcome: ImproveOutcome | null) => {
  if (outcome?.status !== 'done') throw new Error(`not done: ${outcome?.status}`);
  return outcome;
};

describe('runImproveSearch (real engine)', () => {
  it('finds tank upgrades on a fit that fits, priced at the hub', async () => {
    const fitting = world.fit('Rifter', RIFTER);
    const { outcome, seen } = await run(fitting, world.request(fitting, 'tank'));
    const result = done(outcome);
    expect(seen.baseline).toBe(true);
    expect(result.fitTotal).toBe(FIT_TOTAL);
    expect(result.result.checked).toBeGreaterThan(0);
    const rows = [...result.result.noDownside, ...result.result.tradeOffs];
    expect(rows.length).toBeGreaterThan(0);
    expect(result.sides).toBeUndefined();
    expect((await result.recalc(fitting)).ehp).toBeCloseTo(result.before.ehp);
  });

  it('hands over to Make it fit when the fit is over its powergrid', async () => {
    const fitting = world.fit('Rifter', { medium: ['Large Shield Extender II'] });
    const { outcome } = await run(fitting, world.request(fitting, 'tank'));
    expect(outcome).toEqual({ status: 'overBudget', resources: ['powergrid'] });
  });

  it('searches nothing when the budget is under the fit’s own price', async () => {
    const fitting = world.fit('Rifter', RIFTER);
    const { outcome, seen } = await run(fitting, world.request(fitting, 'tank', { iskBudget: 1 }));
    expect(outcome).toEqual({ status: 'belowPrice', budget: 1, fitTotal: FIT_TOTAL });
    expect(seen.makeover).toBe(false);
  });

  it('runs both Defense sides for a tank goal under Shield, and keeps the neutral options apart', async () => {
    const fitting = world.fit('Rifter', RIFTER);
    const request = world.request(fitting, 'tank', { reach: 'rebalance', defense: 'shield' });
    const result = done((await run(fitting, request)).outcome);
    expect(result.sides).toBeDefined();
    expect(Object.keys(result.sides!).sort()).toEqual(['armor', 'shield']);
    expect(result.neutral).toBeDefined();
    expect(result.result.checked).toBe(result.sides!.shield.checked + result.sides!.armor.checked);
  });

  it('skips the Makeover after "Show best so far", and runs it otherwise', async () => {
    const fitting = world.fit('Rifter', RIFTER);
    const request = world.request(fitting, 'tank', { reach: 'rework' });
    const stoppedEarly = await run(fitting, request, () => true);
    expect(done(stoppedEarly.outcome).result.stopped).toBe(true);
    expect(stoppedEarly.seen.makeover).toBe(false);
    expect(done(stoppedEarly.outcome).makeover).toBeUndefined();

    const stoppedInMakeover = await run(fitting, request, (seen) => seen.makeover);
    expect(stoppedInMakeover.seen.makeover).toBe(true);
    expect(done(stoppedInMakeover.outcome).result.stopped).toBe(true);
  });

  it('never offers a compensating swap of a mutated module, or to Officer or Deadspace', async () => {
    const STABILIZERS_II = world.id('Inertial Stabilizers II');
    const SHIELD_EXTENDER_II = world.id('Small Shield Extender II');
    const plain = world.fit('Astero', {
      low: ['Damage Control II', 'Inertial Stabilizers II'],
      medium: ['Small Shield Extender II'],
      rig: ['Small Core Defense Field Extender I'],
    });
    const fitting: Fitting = {
      ...plain,
      modules: plain.modules.map((module) =>
        module.typeId === STABILIZERS_II
          ? {
              ...module,
              mutation: { baseTypeId: STABILIZERS_II, mutaplasmidTypeId: 52224, attributes: {} },
            }
          : module
      ),
    };
    const ports = world.ports(fitting);
    const fitCheck = ports.fitCheck;
    ports.fitCheck = (slot, typeId) =>
      typeId === SHIELD_EXTENDER_II ? { fitsHull: true, canFly: false } : fitCheck(slot, typeId);
    const priced: number[][] = [];
    const prices = ports.prices;
    ports.prices = (typeIds) => {
      priced.push([...typeIds]);
      return prices(typeIds);
    };
    const metaOf = (typeId: number) => world.variations.types[typeId]?.metaGroupId ?? 0;
    const allowed = (typeIds: readonly number[]) =>
      !typeIds.some((typeId) => typeId === STABILIZERS_II || [5, 6].includes(metaOf(typeId)));

    const result = done(
      (await run(fitting, world.request(fitting, 'tank'), undefined, ports)).outcome
    );
    expect(priced[0]).toContain(world.id('Small Core Defense Field Extender II'));
    expect(allowed(priced[0]!)).toBe(true);
    const rows = [...result.result.noDownside, ...result.result.tradeOffs];
    expect(rows.some((row) => row.candidate.fromTypeId === STABILIZERS_II)).toBe(false);

    const { swaps, priceOf } = await result.completion();
    expect(swaps.length).toBeGreaterThan(0);
    expect(priceOf(swaps[0]!.toTypeId)).toBe(PRICE);
    expect(allowed(swaps.flatMap((swap) => [swap.fromTypeId, swap.toTypeId]))).toBe(true);
  });
});
