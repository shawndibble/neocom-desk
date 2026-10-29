import { describe, expect, it } from 'vitest';
import {
  damageOf,
  findImprovements,
  goalAvailability,
  improveCandidates,
  overSpendCap,
  rankImproveOptions,
  type FlyableCompensators,
  type ImproveCandidate,
  type ImproveGoal,
  type ImproveOption,
} from './improve';
import { buildVariationIndex } from '../market/variations';
import type { Fitting, FittingStats, RuleBreak } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';
import { BUILT_IN_TARGET_PROFILES } from './targetProfile';
import type { AppliedWeapon } from './appliedDps';

/** What each fitted type adds to the fit; the fit's stats are the base plus every module's row. */
interface Row {
  dps?: number;
  ehp?: number;
  speed?: number;
  cpu?: number;
  /** Turns the capacitor unstable. */
  capUnstable?: boolean;
  /** Offsets every module that turns the capacitor unstable. */
  capCover?: boolean;
  /** A module the pilot switches on; it turns the capacitor unstable only while running. */
  toggled?: boolean;
  /** Signature radius added, in m. */
  sig?: number;
  /** Capacitor recharge time added, in ms. */
  recharge?: number;
  /** Fitting rules this module breaks. */
  breaks?: RuleBreak[];
}

function stats(rows: Row[], states: string[] = []): FittingStats {
  const sum = (key: 'dps' | 'ehp' | 'speed' | 'cpu' | 'sig' | 'recharge') =>
    rows.reduce((total, row) => total + (row[key] ?? 0), 0);
  const base = baseFittingStats();
  return {
    ...base,
    ruleBreaks: rows.flatMap((row) => row.breaks ?? []),
    modules: rows.flatMap((row, i) =>
      row.toggled ? [{ state: states[i] ?? 'online', maxState: 'active' }] : []
    ),
    cpuUsed: sum('cpu'),
    capacitorRechargeTime: base.capacitorRechargeTime + sum('recharge'),
    ehp: base.ehp + sum('ehp'),
    capacitor:
      rows.some((row, i) => row.capUnstable || (row.toggled && states[i] === 'active')) &&
      !rows.some((row) => row.capCover)
        ? { stable: false, depletesInSeconds: 120 }
        : base.capacitor,
    navigation: { ...base.navigation, maxVelocity: base.navigation.maxVelocity + sum('speed') },
    targeting: { ...base.targeting, signatureRadius: base.targeting.signatureRadius + sum('sig') },
    offense: {
      ...base.offense,
      dps: base.offense.dps + sum('dps'),
      sustainedDps: base.offense.sustainedDps + sum('dps'),
    },
  } as FittingStats;
}

function fit(typeIds: number[]): Fitting {
  return {
    shipTypeId: 1,
    name: 'Test',
    modules: typeIds.map((typeId, slotIndex) => ({ slot: 'low', slotIndex, typeId })),
  } as unknown as Fitting;
}

const calc = (table: Record<number, Row>) => async (f: Fitting) =>
  stats(
    f.modules.map((m) => table[m.typeId] ?? {}),
    f.modules.map((m) => m.state)
  );

const candidate = (fromTypeId: number, toTypeId: number, slotIndex = 0): ImproveCandidate => ({
  fromTypeId,
  toTypeId,
  at: [{ slot: 'low', slotIndex }],
});

async function search(
  goal: ImproveGoal,
  table: Record<number, Row>,
  candidates: ImproveCandidate[],
  prices: Record<number, number> = {},
  base = fit([1]),
  extra: {
    compensators?: FlyableCompensators;
    spendCap?: number | null;
    mode?: 'buy' | 'refit';
  } = {}
) {
  const stat = calc(table);
  const before = await stat(base);
  const result = await findImprovements({
    fitting: base,
    before,
    goal,
    candidates,
    stats: stat,
    priceOf: (typeId) => prices[typeId] ?? null,
    ...extra,
  });
  if (result === null) throw new Error('cancelled');
  return result;
}

const toIds = (options: readonly ImproveOption[]) => options.map((o) => o.candidate.toTypeId);

describe('findImprovements fitting rules', () => {
  const twoDamageControls: RuleBreak = {
    kind: 'max_group',
    groupId: 60,
    limit: 'fitted',
    used: 2,
    allowed: 1,
  };
  const wrongSlot: RuleBreak = { kind: 'wrong_slot', typeId: 9 };

  it('drops a candidate whose after-fit breaks a rule the starting fit did not', async () => {
    const table = { 1: { dps: 0 }, 2: { dps: 50, breaks: [twoDamageControls] }, 3: { dps: 20 } };
    const result = await search('damage', table, [candidate(1, 2), candidate(1, 3)]);
    expect(toIds(result.noDownside)).toEqual([3]);
    expect(result.rejected).toEqual([]);
  });

  it('still improves a fit that already breaks a rule, without adding a break', async () => {
    const table = {
      1: { dps: 0, breaks: [wrongSlot] },
      2: { dps: 50, breaks: [wrongSlot, twoDamageControls] },
      3: { dps: 20, breaks: [wrongSlot] },
    };
    const result = await search('damage', table, [candidate(1, 2), candidate(1, 3)]);
    expect(toIds(result.noDownside)).toEqual([3]);
  });
});

describe('findImprovements goals', () => {
  it('More damage keeps only swaps that raise damage, best first', async () => {
    const table = { 1: { dps: 0 }, 2: { dps: 20 }, 3: { dps: 50 }, 4: { dps: -10 } };
    const result = await search('damage', table, [
      candidate(1, 2),
      candidate(1, 3),
      candidate(1, 4),
    ]);
    expect(toIds(result.noDownside)).toEqual([3, 2]);
    expect(result.tradeOffs).toEqual([]);
  });

  it('Tankier scores EHP', async () => {
    const table = { 1: {}, 2: { ehp: 100 }, 3: { dps: 50 } };
    const result = await search('tank', table, [candidate(1, 2), candidate(1, 3)]);
    expect(toIds(result.noDownside)).toEqual([2]);
  });

  it('Faster scores max velocity', async () => {
    const table = { 1: {}, 2: { speed: 20 }, 3: { ehp: 500 } };
    const result = await search('speed', table, [candidate(1, 2), candidate(1, 3)]);
    expect(toIds(result.noDownside)).toEqual([2]);
  });

  it('Best overall adds the stats up, so a big damage gain outweighs a small speed loss', async () => {
    const table = { 1: {}, 2: { dps: 50, speed: -10 }, 3: { speed: 10 } };
    const result = await search('overall', table, [candidate(1, 2), candidate(1, 3)]);
    expect(toIds([...result.noDownside, ...result.tradeOffs])).toContain(2);
    expect(result.tradeOffs[0].candidate.toTypeId).toBe(2);
    expect(result.tradeOffs[0].lost.map((l) => l.change.key)).toContain('maxVelocity');
  });

  it('a swap that raises signature radius lands in Trade-offs with its size', async () => {
    const table = { 1: {}, 2: { ehp: 100, sig: 10 } };
    const result = await search('overall', table, [candidate(1, 2)]);
    expect(result.noDownside).toEqual([]);
    const lost = result.tradeOffs[0].lost;
    expect(lost).toHaveLength(1);
    expect(lost[0].change).toMatchObject({ key: 'signatureRadius' });
    expect(lost[0].change.after - lost[0].change.before).toBe(10);
  });

  it('a longer capacitor recharge is a downside', async () => {
    const table = { 1: {}, 2: { ehp: 100, recharge: 28000 } };
    const result = await search('tank', table, [candidate(1, 2)]);
    expect(result.noDownside).toEqual([]);
    expect(result.tradeOffs[0].lost.map((l) => l.change.key)).toEqual(['capacitorRechargeTime']);
  });

  it('a swap that gains nothing on the goal is listed under no goal but Cheaper', async () => {
    const table = { 1: {}, 2: { ehp: 100 } };
    const priced = { 1: 2000, 2: 1000 };
    const tank = await search('speed', table, [candidate(1, 2)], priced);
    expect([...tank.noDownside, ...tank.tradeOffs]).toEqual([]);
    const cheaper = await search('cheaper', table, [candidate(1, 2)], priced);
    expect(toIds(cheaper.noDownside)).toEqual([2]);
  });

  it('Longer reach scores the guns’ optimal and falloff', async () => {
    const turret = (optimal: number) => ({
      kind: 'turret' as const,
      dps: 100,
      optimal,
      falloff: 10000,
      tracking: 1,
      optimalSigRadius: 40000,
    });
    const reachStats = async (f: Fitting) => {
      const s = stats([]);
      const optimal = f.modules[0].typeId === 2 ? 30000 : 20000;
      return { ...s, applied: { ...s.applied, weapons: [turret(optimal)] } } as FittingStats;
    };
    const base = fit([1]);
    const before = await reachStats(base);
    const result = await findImprovements({
      fitting: base,
      before,
      goal: 'reach',
      candidates: [candidate(1, 2)],
      stats: reachStats,
      priceOf: () => null,
    });
    expect(toIds(result!.noDownside)).toEqual([2]);
  });

  it('Cheaper ranks by ISK saved', async () => {
    const table = { 1: {}, 2: {}, 3: {} };
    const result = await search('cheaper', table, [candidate(1, 2), candidate(1, 3)], {
      1: 1000,
      2: 800,
      3: 100,
    });
    expect(toIds(result.noDownside)).toEqual([3, 2]);
    expect(result.noDownside[0].iskDelta).toBe(-900);
  });

  it('Cheaper never offers an unpriced swap: it cannot say it saves anything', async () => {
    const result = await search('cheaper', { 1: {}, 2: {} }, [candidate(1, 2)], { 1: 1000 });
    expect(result.noDownside).toEqual([]);
    expect(result.tradeOffs).toEqual([]);
  });
});

describe('findImprovements replacing an unflyable module', () => {
  const fix = (fromTypeId: number, toTypeId: number): ImproveCandidate => ({
    ...candidate(fromTypeId, toTypeId),
    fixesUnflyable: true,
  });

  it('lists a swap that scores worse on the goal under makeFlyable, apart from the real gains', async () => {
    const table = { 1: { dps: 50 }, 2: { dps: 10 }, 3: { dps: 70 }, 4: { dps: 60 } };
    const result = await search('damage', table, [candidate(1, 3), candidate(1, 4), fix(1, 2)]);
    expect(toIds(result.makeFlyable)).toEqual([2]);
    expect(toIds(result.noDownside)).toEqual([3, 4]);
    expect(result.tradeOffs).toEqual([]);
  });

  it('ignores the Cheaper stat guardrails, but not the fit’s CPU or a stable capacitor', async () => {
    const table = { 1: {}, 2: { dps: -50 }, 3: { cpu: 999 }, 4: { capUnstable: true } };
    const result = await search('cheaper', table, [fix(1, 2), fix(1, 3), fix(1, 4)], {
      1: 100,
      2: 500,
    });
    expect(toIds(result.makeFlyable)).toEqual([2]);
    expect(result.rejected).toEqual([]);
    expect(result.flyableBlocked.map((r) => [r.candidate.toTypeId, r.guardrail])).toEqual([
      [3, 'budget'],
      [4, 'capStable'],
    ]);
  });
});

describe('findImprovements replacing an unflyable module and the capacitor', () => {
  const fix: ImproveCandidate = { ...candidate(1, 2), fixesUnflyable: true };
  const running = (typeIds: number[]) =>
    ({
      ...fit(typeIds),
      modules: typeIds.map((typeId, slotIndex) => ({
        slot: 'low',
        slotIndex,
        typeId,
        state: 'active',
      })),
    }) as unknown as Fitting;

  it('allows a toggled replacement that is stable with the toggled modules off', async () => {
    const table = { 1: {}, 2: { toggled: true } };
    const result = await search('damage', table, [fix], {}, running([1]));
    expect(toIds(result.makeFlyable)).toEqual([2]);
  });

  it('blocks one that is still unstable with the toggled modules off', async () => {
    const table = { 1: {}, 2: { capUnstable: true }, 5: { toggled: true } };
    const result = await search('damage', table, [fix], {}, fit([1, 5]));
    expect(result.makeFlyable).toEqual([]);
    expect(result.flyableBlocked.map((r) => r.guardrail)).toEqual(['capStable']);
  });

  it('still offers another replacement that keeps the capacitor stable', async () => {
    const table = { 1: {}, 2: { capUnstable: true }, 3: {} };
    const result = await search('damage', table, [
      fix,
      { ...candidate(1, 3), fixesUnflyable: true },
    ]);
    expect(toIds(result.makeFlyable)).toEqual([3]);
    expect(result.flyableBlocked.map((r) => r.candidate.toTypeId)).toEqual([2]);
  });

  it('leaves a ship whose capacitor was already unstable alone', async () => {
    const table = { 1: { capUnstable: true }, 2: { capUnstable: true } };
    const result = await search('damage', table, [fix]);
    expect(toIds(result.makeFlyable)).toEqual([2]);
  });

  it('blocks an unstable replacement on a ship with nothing to toggle', async () => {
    const table = { 1: {}, 2: { capUnstable: true } };
    const result = await search('damage', table, [fix], {}, running([1]));
    expect(result.flyableBlocked.map((r) => r.guardrail)).toEqual(['capStable']);
  });
});

describe('findImprovements Make Flyable capacitor cover', () => {
  // Module 2 flies but turns the capacitor unstable; module 6 in place of 5 steadies it.
  const base = fit([1, 5]);
  const fix: ImproveCandidate = { ...candidate(1, 2), fixesUnflyable: true };
  const swapFor = (toTypeId: number, fromTypeId = 5) => ({
    slot: 'low' as const,
    slotIndex: 1,
    fromTypeId,
    toTypeId,
  });
  const table = {
    1: {},
    2: { capUnstable: true },
    5: {},
    6: { capCover: true },
    7: { capCover: true },
  };

  it('adds the swap that keeps the capacitor stable, so the option can be applied', async () => {
    const prices = { 1: 10, 2: 10, 5: 50, 6: 200 };
    const result = await search('damage', table, [fix], prices, base, {
      compensators: () => [swapFor(6)],
    });
    expect(result.flyableBlocked).toEqual([]);
    const [option] = result.makeFlyable;
    expect(option.candidate.toTypeId).toBe(2);
    expect(option.candidate.pairedWith?.toTypeId).toBe(6);
    expect(option.after.capacitor.stable).toBe(true);
    expect(option.candidate.covers).toBe('capacitor');
    expect(option.iskDelta).toBe(150);
  });

  it('offers the cheaper of two covers first', async () => {
    const prices = { 1: 10, 2: 10, 5: 50, 6: 400, 7: 100 };
    const result = await search('damage', table, [fix], prices, base, {
      compensators: () => [swapFor(6), swapFor(7)],
    });
    expect(result.makeFlyable.map((o) => o.candidate.pairedWith?.toTypeId)).toEqual([7, 6]);
  });

  it('leaves the greyed row when no swap steadies the capacitor', async () => {
    const result = await search('damage', table, [fix], {}, base, {
      compensators: () => [swapFor(5, 5)],
    });
    expect(result.makeFlyable).toEqual([]);
    expect(result.flyableBlocked.map((r) => r.guardrail)).toEqual(['capStable']);
  });

  it('keeps a capacitor fix out of the implant list, which only helps CPU and powergrid', async () => {
    const result = await search('damage', table, [fix], {}, base, {
      compensators: () => [swapFor(5, 5)],
    });
    expect(result.flyableOverrun).toEqual([]);
  });
});

describe('findImprovements Make Flyable bundles', () => {
  // Module 2 flies but takes 70 CPU next to module 5's 60: 130 of 100.
  const table = { 1: { cpu: 10 }, 2: { cpu: 70 }, 5: { cpu: 60 }, 6: { cpu: 20 }, 7: { cpu: 55 } };
  const base = fit([1, 5]);
  const prices = { 1: 50, 2: 50, 5: 100, 6: 300, 7: 100 };
  const fix: ImproveCandidate = { ...candidate(1, 2), fixesUnflyable: true };
  const swapFor = (toTypeId: number) => ({
    slot: 'low' as const,
    slotIndex: 1,
    fromTypeId: 5,
    toTypeId,
  });

  it('adds the swap that frees the CPU, so the option can be applied', async () => {
    const result = await search('damage', table, [fix], prices, base, {
      compensators: () => [swapFor(6)],
    });
    expect(result.flyableBlocked).toEqual([]);
    const [option] = result.makeFlyable;
    expect(option.candidate.toTypeId).toBe(2);
    expect(option.candidate.pairedWith?.toTypeId).toBe(6);
    expect(option.after.cpuUsed).toBeLessThanOrEqual(option.after.cpuTotal);
    expect(option.fitting.modules.map((m) => m.typeId)).toEqual([2, 6]);
    expect(option.iskDelta).toBe(200);
  });

  it('reports the fix that overran even when swaps cover it, so implants can be offered beside them', async () => {
    const result = await search('damage', table, [fix], prices, base, {
      compensators: () => [swapFor(6)],
    });
    expect(result.makeFlyable).toHaveLength(1);
    expect(result.flyableOverrun.map((r) => r.candidate.toTypeId)).toEqual([2]);
  });

  it('prefers the fewest swaps: a single before a pair', async () => {
    const wide = fit([1, 5, 5]);
    const result = await search('damage', table, [fix], prices, wide, {
      compensators: () => [swapFor(6), { slot: 'low', slotIndex: 2, fromTypeId: 5, toTypeId: 7 }],
    });
    expect(result.makeFlyable[0].candidate.pairedWith?.pairedWith).toBeUndefined();
  });

  it('keeps the fix as a greyed row with its reason when nothing frees enough', async () => {
    const result = await search('damage', table, [fix], prices, base, {
      compensators: () => [swapFor(7)],
    });
    expect(result.makeFlyable).toEqual([]);
    expect(result.flyableBlocked.map((r) => [r.candidate.toTypeId, r.guardrail])).toEqual([
      [2, 'budget'],
    ]);
  });

  it('greys a bundle that costs more than the spend cap', async () => {
    const result = await search('damage', table, [fix], prices, base, {
      compensators: () => [swapFor(6)],
      spendCap: 150,
      mode: 'refit',
    });
    expect(result.makeFlyable).toEqual([]);
    expect(result.flyableBlocked.map((r) => r.guardrail)).toEqual(['spend']);
  });
});

describe('findImprovements guardrails', () => {
  it('rejects a swap that puts the fit over CPU', async () => {
    const table = { 1: { cpu: 50 }, 2: { cpu: 150, dps: 50 } };
    const result = await search('damage', table, [candidate(1, 2)]);
    expect(result.noDownside).toEqual([]);
    expect(result.rejected.map((r) => r.guardrail)).toEqual(['budget']);
  });

  it('rejects a combat swap that turns a stable capacitor unstable', async () => {
    const table = { 1: {}, 2: { dps: 50, capUnstable: true } };
    const result = await search('damage', table, [candidate(1, 2)]);
    expect(result.noDownside).toEqual([]);
    expect(result.rejected[0].guardrail).toBe('capStable');
  });

  it('Cheaper keeps damage, tank and speed each within 10%', async () => {
    const table = {
      1: {},
      // Damage 100 → 85: 15% down.
      2: { dps: -15 },
      // Damage 100 → 92: within 10%, a trade-off.
      3: { dps: -8 },
    };
    const result = await search('cheaper', table, [candidate(1, 2), candidate(1, 3)], {
      1: 1000,
      2: 100,
      3: 500,
    });
    expect(toIds(result.tradeOffs)).toEqual([3]);
    expect(result.rejected.map((r) => [r.candidate.toTypeId, r.guardrail])).toEqual([
      [2, 'keepsStats'],
    ]);
  });

  it('lists the closest rejected swaps, best score first', async () => {
    const table = {
      1: { cpu: 50 },
      2: { cpu: 150, dps: 10 },
      3: { cpu: 150, dps: 40 },
      4: { cpu: 150, dps: 20 },
    };
    const result = await search('damage', table, [
      candidate(1, 2),
      candidate(1, 3),
      candidate(1, 4),
    ]);
    expect(toIds(result.rejected)).toEqual([3, 4, 2]);
  });
});

describe('findImprovements whole-fit results', () => {
  it('swaps every copy a candidate names, and the option carries the swapped Fitting and its stats', async () => {
    const table = { 1: {}, 2: { dps: 10 } };
    const base = fit([1, 1]);
    const result = await search(
      'damage',
      table,
      [
        {
          fromTypeId: 1,
          toTypeId: 2,
          at: [
            { slot: 'low', slotIndex: 0 },
            { slot: 'low', slotIndex: 1 },
          ],
        },
      ],
      {},
      base
    );
    const option = result.noDownside[0];
    expect(option.fitting.modules.map((m) => m.typeId)).toEqual([2, 2]);
    expect(option.after).toEqual(await calc(table)(option.fitting));
    expect(option.after.offense.dps).toBe(120);
  });

  it('prices every copy swapped', async () => {
    const table = { 1: {}, 2: { dps: 10 } };
    const result = await search(
      'damage',
      table,
      [
        {
          fromTypeId: 1,
          toTypeId: 2,
          at: [
            { slot: 'low', slotIndex: 0 },
            { slot: 'low', slotIndex: 1 },
          ],
        },
      ],
      { 1: 100, 2: 300 },
      fit([1, 1])
    );
    expect(result.noDownside[0].iskDelta).toBe(400);
  });

  it('skips a candidate whose calculation throws', async () => {
    const base = fit([1]);
    const ok = calc({ 1: {}, 3: { dps: 5 } });
    const before = await ok(base);
    const result = await findImprovements({
      fitting: base,
      before,
      goal: 'damage',
      candidates: [candidate(1, 2), candidate(1, 3)],
      stats: async (f) => {
        if (f.modules[0].typeId === 2) throw new Error('boom');
        return ok(f);
      },
      priceOf: () => null,
    });
    expect(toIds(result!.noDownside)).toEqual([3]);
  });

  it('throws when every calculation fails, rather than report nothing improves', async () => {
    const base = fit([1]);
    const before = await calc({})(base);
    await expect(
      findImprovements({
        fitting: base,
        before,
        goal: 'damage',
        candidates: [candidate(1, 2)],
        stats: async () => {
          throw new Error('worker gone');
        },
        priceOf: () => null,
      })
    ).rejects.toThrow();
  });

  it('reports progress and returns null when cancelled', async () => {
    const base = fit([1]);
    const stat = calc({});
    const before = await stat(base);
    const progress: number[] = [];
    let cancelled = false;
    const result = await findImprovements({
      fitting: base,
      before,
      goal: 'damage',
      candidates: [candidate(1, 2), candidate(1, 3), candidate(1, 4)],
      stats: stat,
      priceOf: () => null,
      onProgress: (done) => {
        progress.push(done);
        if (done === 1) cancelled = true;
      },
      isCancelled: () => cancelled,
    });
    expect(result).toBeNull();
    expect(progress).toEqual([1]);
  });

  it('stops early with what it has when asked for the best so far', async () => {
    const base = fit([1]);
    const stat = calc({ 2: { dps: 10 }, 3: { dps: 20 } });
    const before = await stat(base);
    let stop = false;
    const result = await findImprovements({
      fitting: base,
      before,
      goal: 'damage',
      candidates: [candidate(1, 2), candidate(1, 3)],
      stats: stat,
      priceOf: () => null,
      onProgress: () => {
        stop = true;
      },
      shouldStop: () => stop,
    });
    expect(result!.stopped).toBe(true);
    expect(toIds(result!.noDownside)).toEqual([2]);
    expect(result!.checked).toBe(1);
  });
});

describe('rankImproveOptions', () => {
  const option = (score: number, iskDelta: number | null, toTypeId: number) =>
    ({ score, iskDelta, candidate: candidate(1, toTypeId) }) as unknown as ImproveOption;

  it('breaks a tie on score by the cheaper swap', () => {
    const ranked = rankImproveOptions([option(0.1, 500, 2), option(0.1, 100, 3)]);
    expect(toIds(ranked)).toEqual([3, 2]);
  });

  it('sorts an unpriced swap last, even ahead of a better score', () => {
    const ranked = rankImproveOptions([option(0.5, null, 2), option(0.1, 100, 3)]);
    expect(toIds(ranked)).toEqual([3, 2]);
  });
});

describe('goalAvailability', () => {
  it('disables damage and reach on a fit that fires nothing, with a reason', () => {
    const unarmed = { ...stats([]), offense: { ...stats([]).offense, dps: 0, sustainedDps: 0 } };
    expect(goalAvailability('damage', unarmed)).toEqual({ available: false, reason: 'noWeapons' });
    expect(goalAvailability('reach', unarmed)).toEqual({
      available: false,
      reason: 'noGunsOrLaunchers',
    });
    expect(goalAvailability('tank', unarmed)).toEqual({ available: true });
  });

  it('keeps reach available when the fitted weapons have no charge loaded', () => {
    const base = stats([]);
    const empty = { ...base, offense: { ...base.offense, dps: 0, chargelessWeaponCount: 2 } };
    expect(goalAvailability('reach', empty)).toEqual({ available: true });
  });
});

describe('improveCandidates', () => {
  // 10: Tech I root; 11 its Tech II; 12 faction; 13 officer; 14 deadspace; 15 a high-slot sibling.
  const index = buildVariationIndex(
    {
      10: { parentTypeId: null, metaGroupId: 1 },
      11: { parentTypeId: 10, metaGroupId: 2 },
      12: { parentTypeId: 10, metaGroupId: 4 },
      13: { parentTypeId: 10, metaGroupId: 5 },
      14: { parentTypeId: 10, metaGroupId: 6 },
      15: { parentTypeId: 10, metaGroupId: 2 },
    },
    { 1: 'Tech I', 2: 'Tech II', 4: 'Faction', 5: 'Officer', 6: 'Deadspace' }
  );
  const rackOf = { 10: 'low', 11: 'low', 12: 'low', 13: 'low', 14: 'low', 15: 'high' };

  it('offers each fitted type’s same-rack variations once, with every copy, without Officer or Deadspace', () => {
    const fitting = fit([10, 10]);
    const result = improveCandidates(fitting.modules, index, rackOf);
    expect(result.map((c) => c.toTypeId)).toEqual([11, 12]);
    expect(result[0].at).toEqual([
      { slot: 'low', slotIndex: 0 },
      { slot: 'low', slotIndex: 1 },
    ]);
  });
});

describe('damageOf', () => {
  const cruiser = BUILT_IN_TARGET_PROFILES.find((p) => p.id === 'builtin:cruiser')!;
  const launchers = (dps: number, reloadDuty: number): FittingStats => {
    const weapon: AppliedWeapon = {
      kind: 'missile',
      dps,
      reloadDuty,
      range: 40000,
      explosionRadius: 100,
      explosionVelocity: 200,
      damageReductionFactor: 1,
    };
    return { ...stats([]), applied: { weapons: [weapon], droneControlRange: 20000 } };
  };

  it('ranks by sustained applied DPS: RLML II raw 177.1 sustains less than HML II raw 165.3', () => {
    const rlml = launchers(177.1, 114.8 / 177.1);
    const hml = launchers(165.3, 158.9 / 165.3);
    expect(damageOf(rlml, cruiser)).toBeCloseTo(114.8, 1);
    expect(damageOf(hml, cruiser)).toBeCloseTo(158.9, 1);
    expect(damageOf(hml, cruiser)).toBeGreaterThan(damageOf(rlml, cruiser));
  });

  it('without a target equals the listed sustained DPS, drones and fighters counted once', () => {
    const base = stats([]);
    const carrier = {
      ...base,
      offense: { ...base.offense, dps: 1002.4, sustainedDps: 1002.4 },
      droneDps: 0,
      fighters: { ...base.fighters, dps: 501.2 },
    } as FittingStats;
    expect(damageOf(carrier, undefined)).toBe(carrier.offense.sustainedDps);
  });

  it('falls back to the listed sustained DPS when no weapon fires', () => {
    expect(damageOf(stats([{ dps: 80 }]), cruiser)).toBe(
      80 + baseFittingStats().offense.sustainedDps
    );
  });
});

describe('overSpendCap', () => {
  it('counts an implant set against the same budget as the swaps', () => {
    // Planning: the fit costs 900 and the fix 50; 100 of implants makes 1050.
    expect(overSpendCap('buy', 1000, 900, 50, 0)).toBe(false);
    expect(overSpendCap('buy', 1000, 900, 50, 100)).toBe(true);
    // Refitting: only the extra spend counts.
    expect(overSpendCap('refit', 200, 900, 50, 100)).toBe(false);
    expect(overSpendCap('refit', 120, 900, 50, 100)).toBe(true);
  });

  it('never blocks without a cap or a price', () => {
    expect(overSpendCap('buy', null, 900, 50, 1e9)).toBe(false);
    expect(overSpendCap('buy', 10, 900, null, 0)).toBe(false);
  });

  it('still charges the implants of an unpriced change', () => {
    expect(overSpendCap('refit', 100, 900, null, 150)).toBe(true);
  });
});
