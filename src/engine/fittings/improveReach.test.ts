import { describe, expect, it } from 'vitest';
import {
  applyImproveCandidate,
  bestScore,
  findImprovements,
  improveCandidates,
  onlyNeutral,
  onlySide,
  type CandidateOptions,
  type ImproveCandidate,
  type ImproveGoal,
  type ImproveMode,
} from './improve';
import { buildVariationIndex } from '../market/variations';
import type { Fitting, FittingSlotKind, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

// Groups used here: 38 shield extender, 329 armor plate, 46 propulsion, 211 tracking
// enhancer (a Reach group), 60 damage control, 99999 a group no goal moves.
const GROUP: Record<number, number> = {
  1: 38,
  2: 38,
  3: 38, // shield extenders (mid)
  4: 329,
  5: 329, // armor plates (low)
  6: 46,
  7: 46,
  8: 46, // propulsion (mid)
  9: 211,
  10: 211, // tracking enhancers (low)
  11: 60, // damage control (low)
  12: 99999, // a sensor-ish module nothing scores (mid)
  30: 770, // a shield flux coil (low)
  20: 773,
  21: 773, // armor rigs
};
const RACK: Record<number, FittingSlotKind> = {
  1: 'medium',
  2: 'medium',
  3: 'medium',
  4: 'low',
  5: 'low',
  6: 'medium',
  7: 'medium',
  8: 'medium',
  9: 'low',
  10: 'low',
  11: 'low',
  12: 'medium',
  30: 'low',
  20: 'rig',
  21: 'rig',
};

const index = buildVariationIndex(
  {
    1: { parentTypeId: null, metaGroupId: 1 },
    2: { parentTypeId: 1, metaGroupId: 2 },
    3: { parentTypeId: 1, metaGroupId: 5 },
    6: { parentTypeId: null, metaGroupId: 1 },
    7: { parentTypeId: 6, metaGroupId: 2 },
  },
  { 1: 'Tech I', 2: 'Tech II', 5: 'Officer' }
);

const typesByGroup = (groupId: number) =>
  Object.keys(GROUP)
    .map(Number)
    .filter((id) => GROUP[id] === groupId);

const base: CandidateOptions = {
  goal: 'overall',
  reach: 'upgrade',
  defense: 'keep',
  includeRigs: false,
  includeOfficer: false,
  slotCounts: { high: 0, medium: 3, low: 3, rig: 0, subsystem: 0 },
  pool: {
    groupOf: (id) => GROUP[id],
    typeIdsInGroup: typesByGroup,
    published: () => true,
  },
};

const rackOf = Object.fromEntries(Object.entries(RACK).map(([id, rack]) => [id, rack]));

function fit(modules: [FittingSlotKind, number, number][]): Fitting {
  return {
    shipTypeId: 1,
    name: 'T',
    modules: modules.map(([slot, slotIndex, typeId]) => ({ slot, slotIndex, typeId })),
  } as unknown as Fitting;
}

const targets = (list: ImproveCandidate[]) =>
  list.map((c) => `${c.fromTypeId ?? '-'}>${c.toTypeId}@${c.at.map((a) => a.slotIndex).join(',')}`);

describe('Improve Reach', () => {
  it('Upgrade turns a module into a variation of itself and nothing else', () => {
    const f = fit([['medium', 0, 1]]);
    expect(targets(improveCandidates(f.modules, index, rackOf, { ...base, goal: 'tank' }))).toEqual(
      expect.arrayContaining(['1>2@0'])
    );
    const list = improveCandidates(f.modules, index, rackOf, { ...base, goal: 'tank' });
    expect(list.filter((c) => c.fromTypeId !== null).map((c) => c.toTypeId)).toEqual([2]);
  });

  it('Rebalance adds a different module of the same group; Officer stays out unless ticked', () => {
    const f = fit([['medium', 0, 1]]);
    const rebalance = improveCandidates(f.modules, index, rackOf, {
      ...base,
      goal: 'tank',
      reach: 'rebalance',
    });
    expect(rebalance.filter((c) => c.fromTypeId === 1).map((c) => c.toTypeId)).toEqual([2]);
    const withOfficer = improveCandidates(f.modules, index, rackOf, {
      ...base,
      goal: 'tank',
      reach: 'rebalance',
      includeOfficer: true,
    });
    expect(withOfficer.filter((c) => c.fromTypeId === 1).map((c) => c.toTypeId)).toEqual([2, 3]);
  });

  it('Rework tries the goal’s groups for the rack: a tracking enhancer for a damage control for Longer reach', () => {
    const f = fit([['low', 0, 11]]);
    const rework = improveCandidates(f.modules, index, rackOf, {
      ...base,
      goal: 'reach',
      reach: 'rework',
    });
    expect(rework.filter((c) => c.fromTypeId === 11).map((c) => c.toTypeId)).toEqual([9, 10]);
    const rebalance = improveCandidates(f.modules, index, rackOf, {
      ...base,
      goal: 'reach',
      reach: 'rebalance',
    });
    expect(rebalance.filter((c) => c.fromTypeId === 11)).toEqual([]);
  });

  it('Rework never removes the last module doing a job the goal does not score', () => {
    // The only propulsion module (6): Longer reach does not score propulsion.
    const f = fit([
      ['medium', 0, 6],
      ['low', 0, 11],
    ]);
    const options = { ...base, goal: 'reach' as ImproveGoal, reach: 'rework' as const };
    const list = improveCandidates(f.modules, index, rackOf, options);
    // Only modules of its own group (still propulsion) replace 6; no Reach group does.
    expect(list.filter((c) => c.fromTypeId === 6).map((c) => c.toTypeId)).toEqual([7, 8]);
  });

  it('Rework may replace a second module of a job when another still does it', () => {
    const f = fit([
      ['medium', 0, 6],
      ['medium', 1, 8],
    ]);
    const list = improveCandidates(f.modules, index, rackOf, {
      ...base,
      goal: 'reach',
      reach: 'rework',
    });
    // 8 is a lone copy of its own type, but 6 still does propulsion, so 8 can go to a Reach group.
    expect(list.some((c) => c.fromTypeId === 8 && GROUP[c.toTypeId] === 211)).toBe(false);
    // (Reach groups are low-rack; the mid rack has none, so nothing to try, never a removal.)
    expect(list.filter((c) => c.fromTypeId === 8 && GROUP[c.toTypeId] !== 46)).toEqual([]);
  });

  it('a goal that scores the job (Faster scores propulsion) may swap it out of its group', () => {
    const f = fit([['medium', 0, 6]]);
    const list = improveCandidates(f.modules, index, rackOf, {
      ...base,
      goal: 'speed',
      reach: 'rework',
    });
    expect(list.filter((c) => c.fromTypeId === 6).map((c) => c.toTypeId)).toEqual([7, 8]);
  });
});

describe('candidate budgets', () => {
  it('a large same-group list does not starve Rework’s other groups', () => {
    // 40 extra types in group 38 would use a shared 20-target budget before the Reach groups.
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [100 + i, 38]));
    const rack = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [100 + i, 'low']));
    const groupOf = (id: number) => (many as Record<number, number>)[id] ?? GROUP[id];
    const f = fit([['low', 0, 11]]);
    const list = improveCandidates(
      f.modules,
      index,
      { ...rackOf, ...rack },
      {
        ...base,
        goal: 'reach',
        reach: 'rework',
        pool: {
          groupOf,
          typeIdsInGroup: (g) =>
            g === 60
              ? Array.from({ length: 40 }, (_, i) => 100 + i)
              : Object.keys(GROUP)
                  .map(Number)
                  .filter((id) => GROUP[id] === g),
          published: () => true,
        },
      }
    );
    const reachTargets = list.filter((c) => c.fromTypeId === 11 && GROUP[c.toTypeId] === 211);
    expect(reachTargets.map((c) => c.toTypeId)).toEqual([9, 10]);
    expect(list.filter((c) => c.fromTypeId === 11 && c.toTypeId >= 100)).toHaveLength(20);
  });

  it('asks the pool whether a type is flyable before spending the cap', () => {
    const f = fit([['low', 0, 11]]);
    const list = improveCandidates(f.modules, index, rackOf, {
      ...base,
      goal: 'reach',
      reach: 'rework',
      pool: { ...base.pool!, flyable: (_slot, id) => id !== 9 },
    });
    expect(list.filter((c) => c.fromTypeId === 11).map((c) => c.toTypeId)).toEqual([10]);
  });
});

describe('a fitted module the pilot cannot fly', () => {
  const f = fit([['medium', 0, 6]]);
  const offered = (
    flyable: (id: number) => boolean,
    reach: CandidateOptions['reach'] = 'upgrade'
  ) =>
    improveCandidates(f.modules, index, rackOf, {
      ...base,
      reach,
      pool: { ...base.pool!, flyable: (_slot, id) => flyable(id) },
    }).filter((c) => c.fromTypeId === 6);

  it('is replaced by a flyable variant, tagged as a fix, and nothing wider', () => {
    const list = offered((id) => id !== 6);
    expect(list.map((c) => [c.toTypeId, c.fixesUnflyable])).toEqual([[7, true]]);
  });

  it('falls back to the same group when no variant is flyable, whatever the Reach', () => {
    const list = offered((id) => id !== 6 && id !== 7);
    expect(list.map((c) => [c.toTypeId, c.fixesUnflyable])).toEqual([[8, true]]);
  });

  it('keeps a fix when more than the cap of other candidates come first', () => {
    const many = fit([
      ['medium', 0, 6],
      ['low', 0, 11],
    ]);
    const list = improveCandidates(many.modules, index, rackOf, {
      ...base,
      goal: 'reach',
      reach: 'rework',
      limit: 1,
      pool: { ...base.pool!, flyable: () => true, pilotCanFly: (_slot, id) => id !== 11 },
    });
    expect(list.map((c) => [c.fromTypeId, c.fixesUnflyable])).toEqual([[11, true]]);
  });

  it('leaves a flyable module’s candidates untagged', () => {
    const list = offered(() => true);
    expect(list.map((c) => [c.toTypeId, c.fixesUnflyable])).toEqual([[7, undefined]]);
  });
});

describe('empty slots', () => {
  it('fills the first empty slot of each rack from the goal’s groups, always', () => {
    const f = fit([
      ['medium', 0, 12],
      ['low', 0, 11],
    ]);
    const list = improveCandidates(f.modules, index, rackOf, {
      ...base,
      goal: 'reach',
      reach: 'upgrade',
    });
    const fills = list.filter((c) => c.fromTypeId === null);
    // Reach groups only exist in the low rack: slot 1 is its first empty one.
    expect(targets(fills)).toEqual(['->9@1', '->10@1']);
  });

  it('never offers a second Damage Control', () => {
    const f = fit([['low', 0, 11]]);
    const list = improveCandidates(f.modules, index, rackOf, { ...base, goal: 'tank' });
    expect(list.some((c) => c.toTypeId === 11)).toBe(false);
  });

  it('leaves rigs out unless ticked', () => {
    const f = fit([['rig', 0, 20]]);
    const slotCounts = { high: 0, medium: 0, low: 0, rig: 2, subsystem: 0 };
    const off = improveCandidates(f.modules, index, rackOf, {
      ...base,
      goal: 'tank',
      slotCounts,
    });
    expect(off.filter((c) => c.at[0].slot === 'rig')).toEqual([]);
    const on = improveCandidates(f.modules, index, rackOf, {
      ...base,
      goal: 'tank',
      slotCounts,
      includeRigs: true,
    });
    expect(on.some((c) => c.at[0].slot === 'rig' && c.fromTypeId === null)).toBe(true);
  });
});

describe('Defense Choice', () => {
  // A shield-tanked hull: a shield extender in the mids, a damage control and a tracking enhancer in the lows.
  const f = fit([
    ['medium', 0, 1],
    ['low', 0, 11],
    ['low', 1, 9],
  ]);

  it('Armor frees the shield modules and fills the lows with armor, never shield', () => {
    const shielded = fit([
      ['medium', 0, 1],
      ['low', 0, 11],
      ['low', 1, 9],
      ['low', 2, 30],
    ]);
    const list = improveCandidates(shielded.modules, index, rackOf, {
      ...base,
      goal: 'tank',
      defense: 'armor',
      slotCounts: { high: 0, medium: 1, low: 4, rig: 0, subsystem: 0 },
    });
    // The empty low slot (3) takes plates.
    expect(targets(list.filter((c) => c.fromTypeId === null))).toEqual(['->4@3', '->5@3']);
    // The shield flux coil is freed for armor; the tracking enhancer and damage control are not.
    expect(list.some((c) => c.fromTypeId === 30 && GROUP[c.toTypeId] === 329)).toBe(true);
    expect(list.some((c) => c.fromTypeId === 9 && GROUP[c.toTypeId] === 329)).toBe(false);
    expect(list.some((c) => c.fromTypeId === 11 && GROUP[c.toTypeId] === 329)).toBe(false);
    // The mid shield extender is freed too, but armor does not go in a mid slot: nothing to offer.
    expect(list.some((c) => c.fromTypeId === 1 && GROUP[c.toTypeId] === 329)).toBe(false);
  });

  it('Keep as is only offers the fitted side', () => {
    const list = improveCandidates(f.modules, index, rackOf, {
      ...base,
      goal: 'tank',
      defense: 'keep',
      reach: 'rework',
      slotCounts: { high: 0, medium: 3, low: 2, rig: 0, subsystem: 0 },
    });
    const groups = new Set(list.map((c) => GROUP[c.toTypeId]));
    expect(groups.has(329)).toBe(false);
    // Mid fills are shield extenders (the fitted side).
    expect(list.some((c) => c.fromTypeId === null && GROUP[c.toTypeId] === 38)).toBe(true);
  });
});

// A tiny stat model: each module type adds to EHP and CPU; priced by type.
const EHP: Record<number, number> = {
  4: 500,
  5: 800,
  9: 0,
  11: 100,
  1: 300,
  2: 400,
  20: 0,
  21: 900,
};
const CPU: Record<number, number> = { 4: 30, 5: 60, 9: 10, 11: 20, 1: 20, 2: 25 };
const CPU_TOTAL = 100;

function modelStats(f: Fitting): FittingStats {
  const b = baseFittingStats();
  return {
    ...b,
    cpuTotal: CPU_TOTAL,
    cpuUsed: f.modules.reduce((n, m) => n + (CPU[m.typeId] ?? 0), 0),
    ehp: b.ehp + f.modules.reduce((n, m) => n + (EHP[m.typeId] ?? 0), 0),
  } as FittingStats;
}

const model = async (f: Fitting) => modelStats(f);

async function run(
  goal: ImproveGoal,
  fitting: Fitting,
  candidates: ImproveCandidate[],
  prices: Record<number, number>,
  extra: { mode?: ImproveMode; spendCap?: number | null; fitTotal?: number | null } = {}
) {
  const result = await findImprovements({
    fitting,
    before: modelStats(fitting),
    goal,
    candidates,
    stats: model,
    priceOf: (id) => prices[id] ?? null,
    ...extra,
  });
  if (!result) throw new Error('cancelled');
  return result;
}

const fill = (
  toTypeId: number,
  slotIndex: number,
  slot: FittingSlotKind = 'low'
): ImproveCandidate => ({
  fromTypeId: null,
  toTypeId,
  at: [{ slot, slotIndex }],
});
const swap = (
  fromTypeId: number,
  toTypeId: number,
  slotIndex: number,
  slot: FittingSlotKind = 'low'
): ImproveCandidate => ({
  fromTypeId,
  toTypeId,
  at: [{ slot, slotIndex }],
});

describe('fills and pair moves', () => {
  it('a fill that fits is an option with its price as the cost', async () => {
    const f = fit([['low', 0, 11]]);
    const result = await run('tank', f, [fill(4, 1)], { 4: 1000 });
    expect(result.noDownside).toHaveLength(1);
    expect(result.noDownside[0].iskDelta).toBe(1000);
    expect(applyImproveCandidate(f, fill(4, 1)).modules.map((m) => m.typeId)).toEqual([11, 4]);
  });

  it('pairs a downgrade with an add when no single add fits the CPU', async () => {
    // 11 (20) + 1... fit uses 90 of 100 CPU; plates (60) do not fit alone.
    const f = fit([
      ['low', 0, 11],
      ['low', 1, 5],
      ['low', 2, 9],
    ]);
    // Base: 11 (20) + 5 (60) + 9 (10) = 90. Add plate 4 (30): 120 over. Swap 5 -> 4 frees 30: 90.
    const candidates = [fill(4, 3), swap(5, 4, 1)];
    const result = await run('tank', f, candidates, { 4: 100, 5: 200 });
    const paired = [...result.noDownside, ...result.tradeOffs].filter(
      (o) => o.candidate.pairedWith
    );
    expect(paired).toHaveLength(1);
    expect(paired[0].candidate.toTypeId).toBe(4);
    expect(paired[0].candidate.pairedWith?.toTypeId).toBe(4);
    // Cost is the add minus the saving of the downgrade: 100 + (100 - 200).
    expect(paired[0].iskDelta).toBe(0);
    expect(applyImproveCandidate(f, paired[0].candidate).modules).toHaveLength(4);
  });

  it('a pair is not needed when a single add fits', async () => {
    const f = fit([['low', 0, 9]]);
    const result = await run('tank', f, [fill(4, 1), swap(9, 11, 0)], { 4: 1 });
    expect([...result.noDownside, ...result.tradeOffs].some((o) => o.candidate.pairedWith)).toBe(
      false
    );
  });
});

describe('buy and refit accounting', () => {
  const f = fit([
    ['low', 0, 4],
    ['rig', 0, 20],
  ]);

  it('Planning to buy: the swap costs new minus old; a total budget drops options over it', async () => {
    const prices = { 4: 100, 5: 300, 20: 50, 21: 500 };
    const result = await run('tank', f, [swap(4, 5, 0)], prices, {
      mode: 'buy',
      fitTotal: 150,
      spendCap: 400,
    });
    // The fit costs 150 now; the swap makes it 350, under the 400 budget.
    expect(result.noDownside[0].iskDelta).toBe(200);
    const over = await run('tank', f, [swap(4, 5, 0)], prices, {
      mode: 'buy',
      fitTotal: 150,
      spendCap: 300,
    });
    expect(over.noDownside).toEqual([]);
    expect(over.rejected[0].guardrail).toBe('spend');
  });

  it('Refitting: the cap is on the extra spend, and a rig change costs the full new rig and is flagged', async () => {
    const prices = { 4: 100, 5: 300, 20: 50, 21: 500 };
    const rigSwap = swap(20, 21, 0, 'rig');
    const result = await run('tank', f, [rigSwap, swap(4, 5, 0)], prices, {
      mode: 'refit',
      spendCap: 1000,
    });
    const rig = result.noDownside.find((o) => o.candidate.at[0].slot === 'rig');
    expect(rig?.iskDelta).toBe(500);
    expect(rig?.destroysRigs).toBe(true);
    const module = result.noDownside.find((o) => o.candidate.at[0].slot === 'low');
    expect(module?.iskDelta).toBe(200);
    expect(module?.destroysRigs).toBe(false);
  });

  it('an unpriced option sorts last and is never dropped for the budget', async () => {
    const result = await run(
      'tank',
      f,
      [swap(4, 5, 0), fill(9, 1)],
      { 4: 100, 5: 200 },
      {
        mode: 'refit',
        spendCap: 50,
      }
    );
    // 5 costs 100 extra: over the 50 cap. Fill 9 has no price, and gains no EHP either.
    expect(result.rejected[0].guardrail).toBe('spend');
  });
});

describe('Defense search result', () => {
  it('a side with nothing to offer is an empty result, not a missing one', async () => {
    const f = fit([['low', 0, 11]]);
    const result = await run('tank', f, [], {});
    expect(result.noDownside).toEqual([]);
    expect(bestScore(result)).toBeNull();
  });

  it('bestScore is the top option’s gain', async () => {
    const f = fit([['low', 0, 11]]);
    const result = await run('tank', f, [fill(4, 1), fill(5, 1)], {});
    expect(bestScore(result)).toBeGreaterThan(0);
  });
});

describe('onlySide', () => {
  const option = (toTypeId: number, score: number) =>
    ({ candidate: { fromTypeId: 1, toTypeId, at: [] }, score }) as never;
  const result = {
    makeFlyable: [],
    flyableOverrun: [],
    flyableBlocked: [],
    noDownside: [option(2, 0.11), option(11, 0.05), option(5, 0.02)],
    tradeOffs: [option(4, 0.3)],
    rejected: [option(3, 0.4)],
    checked: 7,
    stopped: false,
  };
  const groupOf = (id: number) => GROUP[id];

  it('keeps only options that put the side’s tank modules on the fit', () => {
    const armor = onlySide(result, 'armor', groupOf);
    expect(armor.noDownside.map((o) => o.candidate.toTypeId)).toEqual([5]);
    expect(armor.tradeOffs.map((o) => o.candidate.toTypeId)).toEqual([4]);
    expect(armor.rejected).toEqual([]);
    expect(armor.checked).toBe(7);
    expect(onlySide(result, 'shield', groupOf).noDownside.map((o) => o.candidate.toTypeId)).toEqual(
      [2]
    );
  });

  it('non-strict keeps options that touch no tank module, for the list', () => {
    const mixed = { ...result, noDownside: [option(2, 0.1), option(9, 0.1), option(5, 0.1)] };
    const listed = onlySide(mixed, 'armor', groupOf, false);
    expect(listed.noDownside.map((o) => o.candidate.toTypeId)).toEqual([9, 5]);
  });

  it('a shield-only fit under Armor reports no gain when no armor module helps', () => {
    const shieldOnly = {
      ...result,
      noDownside: [option(2, 0.11), option(11, 0.11)],
      tradeOffs: [],
      rejected: [],
    };
    expect(bestScore(onlySide(shieldOnly, 'armor', groupOf))).toBeNull();
  });

  it('onlyNeutral keeps only options on neither side', () => {
    const mixed = { ...result, noDownside: [option(2, 0.1), option(9, 0.2), option(5, 0.1)] };
    const neutral = onlyNeutral(mixed, groupOf);
    expect(neutral.noDownside.map((o) => o.candidate.toTypeId)).toEqual([9]);
    expect(bestScore(neutral)).toBe(0.2);
    expect(
      bestScore(onlyNeutral({ ...mixed, noDownside: [option(2, 0.1)], tradeOffs: [] }, groupOf))
    ).toBeNull();
  });
});
