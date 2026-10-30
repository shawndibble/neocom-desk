import { describe, expect, it } from 'vitest';
import {
  applyImproveCandidate,
  improveCandidates,
  iskDeltaOf,
  type ImproveCandidate,
} from './improve';
import {
  findMakeover,
  makeoverBar,
  makeoverMoves,
  propulsionStart,
  propulsionTiers,
  rowsBetween,
  type MakeoverMoveOptions,
} from './improveMakeover';
import { jobSettingOf } from './improveJob';
import type { JobCommonality } from './hullCommonality';
import { buildVariationIndex } from '../market/variations';
import type { Fitting, FittingSlotKind, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

// Groups: 38 shield extender, 77 shield hardener, 60 damage control, 57 shield power relay,
// 1156 a shield low module, 770 shield flux coil, 46 propulsion, 774 shield rig, 99999 nothing.
interface Type {
  group: number;
  rack: FittingSlotKind;
  meta: number;
  ehp?: number;
  cpu?: number;
  capUnstable?: boolean;
  name?: string;
}
const TYPES: Record<number, Type> = {
  1: { group: 38, rack: 'medium', meta: 1, ehp: 100, cpu: 10 },
  2: { group: 38, rack: 'medium', meta: 2, ehp: 150, cpu: 12 },
  3: { group: 38, rack: 'medium', meta: 5, ehp: 400, cpu: 12 }, // officer
  4: { group: 77, rack: 'medium', meta: 2, ehp: 120, cpu: 15 },
  5: { group: 77, rack: 'medium', meta: 1, ehp: 90, cpu: 12 },
  10: { group: 60, rack: 'low', meta: 2, ehp: 200, cpu: 5 },
  11: { group: 57, rack: 'low', meta: 2, ehp: 20, cpu: 5 },
  12: { group: 1156, rack: 'low', meta: 2, ehp: 90, cpu: 5 },
  13: { group: 99999, rack: 'low', meta: 1, ehp: 0, cpu: 0 },
  15: { group: 770, rack: 'low', meta: 2, ehp: 60, cpu: 40 },
  16: { group: 1156, rack: 'low', meta: 2, ehp: 500, cpu: 5, capUnstable: true },
  20: { group: 46, rack: 'medium', meta: 2, ehp: 0, cpu: 5 },
  30: { group: 774, rack: 'rig', meta: 2, ehp: 70 },
  31: { group: 774, rack: 'rig', meta: 1, ehp: 10 },
};

function catalogue(types: Record<number, Type>) {
  const ids = Object.keys(types).map(Number);
  const index = buildVariationIndex(
    Object.fromEntries(ids.map((id) => [id, { parentTypeId: null, metaGroupId: types[id].meta }])),
    { 1: 'Tech I', 2: 'Tech II', 5: 'Officer' }
  );
  const rackOf = Object.fromEntries(ids.map((id) => [String(id), types[id].rack]));
  const options = (extra: Partial<MakeoverMoveOptions> = {}): MakeoverMoveOptions => ({
    goal: 'tank',
    defense: 'keep',
    includeRigs: false,
    slotCounts: { high: 0, medium: 2, low: 2, rig: 0, subsystem: 0 },
    pool: {
      groupOf: (id) => types[id]?.group,
      typeIdsInGroup: (group) => ids.filter((id) => types[id].group === group),
      published: () => true,
      nameOf: (id) => types[id]?.name,
    },
    ...extra,
  });
  const moves =
    (extra: Partial<MakeoverMoveOptions> = {}) =>
    (f: Fitting) =>
      makeoverMoves(f.modules, index, rackOf, options(extra));
  return { index, rackOf, options, moves };
}

const CPU_TOTAL = 100;
function statsOf(f: Fitting, types: Record<number, Type> = TYPES): FittingStats {
  const b = baseFittingStats();
  const unstable = f.modules.some((m) => types[m.typeId]?.capUnstable);
  return {
    ...b,
    cpuTotal: CPU_TOTAL,
    cpuUsed: f.modules.reduce((n, m) => n + (types[m.typeId]?.cpu ?? 0), 0),
    ehp: b.ehp + f.modules.reduce((n, m) => n + (types[m.typeId]?.ehp ?? 0), 0),
    capacitor: unstable
      ? { ...b.capacitor, stable: false, depletesInSeconds: 120 }
      : { ...b.capacitor, stable: true },
  } as FittingStats;
}

function fit(modules: [FittingSlotKind, number, number][]): Fitting {
  return {
    shipTypeId: 1,
    name: 'T',
    modules: modules.map(([slot, slotIndex, typeId]) => ({
      slot,
      slotIndex,
      typeId,
      state: 'online',
    })),
  } as unknown as Fitting;
}

const label = (c: ImproveCandidate) =>
  `${c.fromTypeId ?? '-'}>${c.toTypeId}@${c.at.map((a) => `${a.slot[0]}${a.slotIndex}`).join(',')}`;

async function search(
  fitting: Fitting,
  extra: Partial<Parameters<typeof findMakeover>[0]> = {},
  types: Record<number, Type> = TYPES,
  moveOptions: Partial<MakeoverMoveOptions> = {}
) {
  let calls = 0;
  const result = await findMakeover({
    fitting,
    before: statsOf(fitting, types),
    goal: 'tank',
    moves: catalogue(types).moves(moveOptions),
    stats: async (f) => {
      calls++;
      return statsOf(f, types);
    },
    priceOf: () => 1,
    ...extra,
  });
  return { result, calls };
}

describe('makeoverMoves', () => {
  const { moves } = catalogue(TYPES);

  it('tries one copy of identical modules, one slot at a time', () => {
    const list = moves()(
      fit([
        ['low', 0, 11],
        ['low', 1, 11],
      ])
    ).map(label);
    expect(list.some((l) => l.startsWith('11>') && l.endsWith('@l0'))).toBe(true);
    expect(list.some((l) => l.endsWith('@l1'))).toBe(false);
  });

  it('offers the Tech II of a group, never its Tech I, faction or officer', () => {
    const list = moves()(fit([['medium', 0, 1]])).map(label);
    expect(list).toContain('1>2@m0');
    expect(list).toContain('1>4@m0');
    expect(list).not.toContain('1>3@m0');
    expect(list).not.toContain('1>5@m0');
  });

  it("offers a rig group's Tech I beside its Tech II: calibration often leaves room only for a Tech I rig", () => {
    const list = moves({ includeRigs: true })(fit([['rig', 0, 30]])).map(label);
    expect(list).toContain('30>31@r0');
  });

  it('falls back to Tech I when a group has no Tech II', () => {
    const types = { ...TYPES, 2: { ...TYPES[2], meta: 1 }, 4: { ...TYPES[4], meta: 1 } };
    const list = catalogue(types)
      .moves()(fit([['medium', 0, 2]]))
      .map(label);
    expect(list).toContain('2>1@m0');
    expect(list).toContain('2>4@m0');
  });

  it('never offers a second Damage Control', () => {
    const list = moves()(
      fit([
        ['low', 0, 10],
        ['low', 1, 11],
      ])
    ).map(label);
    expect(list.some((l) => l.startsWith('11>10'))).toBe(false);
  });

  it('offers a Damage Control for one of two copies', () => {
    const list = moves()(
      fit([
        ['low', 0, 11],
        ['low', 1, 11],
      ])
    ).map(label);
    expect(list).toContain('11>10@l0');
  });

  it('never removes the last module doing a job the goal does not score', () => {
    const list = moves()(fit([['medium', 0, 20]])).map(label);
    expect(list.some((l) => l.startsWith('20>'))).toBe(false);
  });

  it('fills the first empty slot of each rack from the goal groups', () => {
    const list = moves()(fit([['low', 0, 11]])).map(label);
    expect(list).toContain('->10@l1');
    expect(list).toContain('->4@m0');
  });

  it('with a chosen side on a tank goal, a non-tank module never turns into a tank module', () => {
    const f = fit([['low', 0, 13]]);
    expect(moves()(f).map(label)).toContain('13>10@l0');
    expect(moves({ defense: 'shield' })(f).some((c) => c.fromTypeId === 13)).toBe(false);
  });

  it('leaves rigs out unless they are included', () => {
    const f = fit([['rig', 0, 31]]);
    expect(moves()(f).some((c) => c.at[0].slot === 'rig')).toBe(false);
    expect(moves({ includeRigs: true })(f).map(label)).toContain('31>30@r0');
  });
});

describe('findMakeover', () => {
  it('splits two copies of one module into two different modules', async () => {
    const { result } = await search(
      fit([
        ['low', 0, 11],
        ['low', 1, 11],
      ])
    );
    const rows = result?.makeover?.rows.map(label) ?? [];
    expect(rows).toEqual(expect.arrayContaining(['11>10@l0', '11>12@l1']));
  });

  it('merges identical moves into one row and its figures are one recalculation of the rows', async () => {
    const f = fit([
      ['medium', 0, 1],
      ['medium', 1, 1],
      ['low', 0, 11],
      ['low', 1, 11],
    ]);
    const { result } = await search(f);
    const makeover = result?.makeover;
    expect(makeover).toBeTruthy();
    if (!makeover) return;
    expect(makeover.rows.map(label)).toContain('1>2@m0,m1');
    const remade = makeover.rows.reduce(applyImproveCandidate, f);
    expect(makeover.after).toEqual(statsOf(remade));
    expect(makeover.fitting.modules).toEqual(remade.modules);
  });

  it('finds a pair that only gains together, which the plain search misses', async () => {
    // A hardener gains but overruns the CPU; dropping the flux coil frees it but loses alone.
    const types: Record<number, Type> = {
      1: { group: 38, rack: 'medium', meta: 1, ehp: 100, cpu: 10 },
      4: { group: 77, rack: 'medium', meta: 2, ehp: 120, cpu: 70 },
      15: { group: 770, rack: 'low', meta: 2, ehp: 60, cpu: 40 },
      12: { group: 1156, rack: 'low', meta: 2, ehp: 50, cpu: 0 },
    };
    const f = fit([
      ['medium', 0, 1],
      ['low', 0, 15],
    ]);
    const slots = { slotCounts: { high: 0, medium: 1, low: 1, rig: 0, subsystem: 0 } };
    const kicked = await search(f, {}, types, slots);
    expect(kicked.result?.makeover?.rows.map(label).sort()).toEqual(['15>12@l0', '1>4@m0']);
    const plain = await search(f, { pairKick: false }, types, slots);
    expect(plain.result?.makeover).toBeNull();
  });

  it('lazy rounds reach the same fit as full rounds with fewer calculations', async () => {
    const f = fit([
      ['medium', 0, 1],
      ['medium', 1, 5],
      ['low', 0, 11],
      ['low', 1, 11],
    ]);
    const lazy = await search(f);
    const full = await search(f, { lazy: false });
    expect(lazy.result?.makeover?.fitting.modules).toEqual(full.result?.makeover?.fitting.modules);
    expect(lazy.calls).toBeLessThan(full.calls);
  });

  it('never applies a step that breaks a Guardrail', async () => {
    const f = fit([
      ['low', 0, 11],
      ['low', 1, 11],
    ]);
    // The cap-unstable module is offered and is the biggest single gain.
    expect(catalogue(TYPES).moves()(f).map(label)).toContain('11>16@l0');
    const { result } = await search(f);
    expect(result?.makeover?.fitting.modules.some((m) => m.typeId === 16)).toBe(false);
    expect(result?.makeover?.after.capacitor.stable).toBe(true);
  });

  const FOUR = fit([
    ['medium', 0, 1],
    ['medium', 1, 5],
    ['low', 0, 11],
    ['low', 1, 11],
  ]);

  it('stops at the calculation cap, the confirming recalculation included', async () => {
    const { result, calls } = await search(FOUR, { maxCalcs: 12 });
    expect(result?.stopped).toBe(true);
    expect(calls).toBeLessThanOrEqual(12);
  });

  it('Show best so far keeps the best fit so far, the interrupted round included', async () => {
    const firstRound = catalogue(TYPES).moves()(FOUR).length;
    let calls = 0;
    const result = await findMakeover({
      fitting: FOUR,
      before: statsOf(FOUR),
      goal: 'tank',
      moves: catalogue(TYPES).moves(),
      stats: async (g) => {
        calls++;
        return statsOf(g);
      },
      priceOf: () => 1,
      // Round 1, then three moves of round 2 (the first, cap-unstable, is rejected).
      shouldStop: () => calls >= firstRound + 3,
    });
    expect(result?.stopped).toBe(true);
    expect(result?.makeover?.rows).toHaveLength(2);
  });

  it('concurrency 4 with stats resolving out of order equals a serial run and holds the cap', async () => {
    const serial = await search(FOUR);
    let inFlight = 0;
    let peak = 0;
    let n = 0;
    const maxCalcs = 300;
    const progress: number[] = [];
    const result = await findMakeover({
      fitting: FOUR,
      before: statsOf(FOUR),
      goal: 'tank',
      moves: catalogue(TYPES).moves(),
      stats: async (g) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        // Later calls finish sooner, so results arrive out of order.
        await new Promise((resolve) => setTimeout(resolve, (7 - (n++ % 7)) * 2));
        inFlight--;
        return statsOf(g);
      },
      priceOf: () => 1,
      concurrency: 4,
      maxCalcs,
      onProgress: (calcs) => progress.push(calcs),
    });
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(4);
    expect(result?.makeover?.rows.map(label)).toEqual(serial.result?.makeover?.rows.map(label));
    expect(result?.makeover?.fitting.modules).toEqual(serial.result?.makeover?.fitting.modules);
    expect(result?.makeover?.score).toBe(serial.result?.makeover?.score);
    // Moves calculated ahead of a lazy stop still count.
    expect(result!.calcs).toBeGreaterThanOrEqual(serial.result!.calcs);
    expect(result!.calcs).toBeLessThanOrEqual(maxCalcs);
    expect(Math.max(...progress)).toBeLessThanOrEqual(maxCalcs);
  });

  it('concurrency never starts more calculations than the cap allows', async () => {
    let calls = 0;
    const result = await findMakeover({
      fitting: FOUR,
      before: statsOf(FOUR),
      goal: 'tank',
      moves: catalogue(TYPES).moves(),
      stats: async (g) => {
        calls++;
        return statsOf(g);
      },
      priceOf: () => 1,
      concurrency: 4,
      maxCalcs: 12,
    });
    expect(result?.stopped).toBe(true);
    expect(calls).toBeLessThanOrEqual(12);
    expect(result!.calcs).toBeLessThanOrEqual(12);
  });

  it('offers rig swaps by default', () => {
    const index = buildVariationIndex(
      {
        31: { parentTypeId: null, metaGroupId: 1 },
        30: { parentTypeId: 31, metaGroupId: 2 },
      },
      { 1: 'Tech I', 2: 'Tech II' }
    );
    const list = improveCandidates(
      fit([['rig', 0, 31]]).modules,
      index,
      { '30': 'rig', '31': 'rig' },
      { goal: 'tank' }
    );
    expect(list.some((c) => c.at[0].slot === 'rig' && c.toTypeId === 30)).toBe(true);
  });

  it('prices a rig swap at the full new rig, a module swap unchanged', () => {
    const price = (id: number) => ({ 30: 500, 31: 200, 2: 900, 1: 400 })[id] ?? null;
    const swap = (from: number, to: number, slot: FittingSlotKind): ImproveCandidate => ({
      fromTypeId: from,
      toTypeId: to,
      at: [{ slot, slotIndex: 0 }],
    });
    expect(iskDeltaOf(swap(31, 30, 'rig'), price)).toBe(500);
    expect(iskDeltaOf(swap(1, 2, 'medium'), price)).toBe(500);
    expect(iskDeltaOf({ ...swap(1, 2, 'medium'), pairedWith: swap(31, 30, 'rig') }, price)).toBe(
      1000
    );
  });

  it('an open fit over its budget gets no Makeover and no calculation: Make it fit comes first', async () => {
    // Type 15 uses 40 CPU each: three of them overrun the 100 CPU.
    const over = fit([
      ['low', 0, 15],
      ['low', 1, 15],
      ['low', 2, 15],
    ]);
    const { result, calls } = await search(over, {}, TYPES, {
      slotCounts: { high: 0, medium: 2, low: 3, rig: 0, subsystem: 0 },
    });
    expect(result?.makeover).toBeNull();
    expect(calls).toBe(0);
  });

  it('Cancel returns null', async () => {
    const { result } = await search(fit([['low', 0, 11]]), { isCancelled: () => true });
    expect(result).toBeNull();
  });

  it('shows no makeover of fewer than two changes', async () => {
    const { result } = await search(fit([['low', 0, 11]]), {}, TYPES, {
      slotCounts: { high: 0, medium: 0, low: 1, rig: 0, subsystem: 0 },
    });
    expect(result).not.toBeNull();
    expect(result?.makeover).toBeNull();
  });

  it('shows no makeover when it beats the best single change by too little', async () => {
    // A Damage Control gains 1000 EHP; the second change adds only 10 more.
    const types: Record<number, Type> = {
      13: { group: 99999, rack: 'low', meta: 1, ehp: 0 },
      14: { group: 99998, rack: 'low', meta: 1, ehp: 0 },
      10: { group: 60, rack: 'low', meta: 2, ehp: 1000 },
      12: { group: 1156, rack: 'low', meta: 2, ehp: 10 },
    };
    const f = fit([
      ['low', 0, 13],
      ['low', 1, 14],
    ]);
    const { result } = await search(f, {}, types);
    expect(result?.makeover).toBeNull();
    const counted = await search(f, { bestSingle: 0 }, types);
    expect(counted.result?.makeover?.rows).toHaveLength(2);
  });

  it('must beat the single swap score Improve already found', async () => {
    const { result } = await search(
      fit([
        ['low', 0, 11],
        ['low', 1, 11],
      ]),
      { bestSingle: 100 }
    );
    expect(result?.makeover).toBeNull();
  });
});

describe('rowsBetween', () => {
  it('shows a slot changed twice once, first module to last', () => {
    const f = fit([
      ['low', 0, 11],
      ['low', 1, 11],
    ]);
    const low0 = (from: number, to: number) => ({
      fromTypeId: from,
      toTypeId: to,
      at: [{ slot: 'low' as const, slotIndex: 0 }],
    });
    const twice = applyImproveCandidate(applyImproveCandidate(f, low0(11, 10)), low0(10, 12));
    expect(rowsBetween(f, twice).map(label)).toEqual(['11>12@l0']);
  });
});

describe('makeoverBar', () => {
  const { index } = catalogue(TYPES);
  const option = (toTypeId: number, score: number, pairedTo?: number) =>
    ({
      candidate: {
        fromTypeId: 1,
        toTypeId,
        at: [{ slot: 'medium', slotIndex: 0 }],
        ...(pairedTo === undefined
          ? {}
          : {
              pairedWith: {
                fromTypeId: 11,
                toTypeId: pairedTo,
                at: [{ slot: 'low', slotIndex: 0 }],
              },
            }),
      },
      score,
    }) as unknown as Parameters<typeof makeoverBar>[0]['noDownside'][number];

  it('is the best single swap to a Tech I or Tech II module, never a faction or officer step', () => {
    // 3 is officer: a big gain the Makeover never offers does not hide it.
    const bar = makeoverBar(
      { noDownside: [option(3, 0.5), option(2, 0.1)], tradeOffs: [option(4, 0.2)] },
      index
    );
    expect(bar).toBe(0.2);
  });

  it('counts a paired swap only when every module it adds is Tech I or II', () => {
    expect(makeoverBar({ noDownside: [option(2, 0.3, 3)], tradeOffs: [] }, index)).toBeNull();
    expect(makeoverBar({ noDownside: [option(2, 0.3, 12)], tradeOffs: [] }, index)).toBe(0.3);
  });

  it('is null when no single swap qualifies', () => {
    expect(makeoverBar({ noDownside: [option(3, 0.5)], tradeOffs: [] }, index)).toBeNull();
  });
});

describe('hull commonality (#5581)', () => {
  const common = (shares: Record<number, number>): JobCommonality => ({
    fits: 20,
    groupShare: new Map(Object.entries(shares).map(([g, s]) => [Number(g), s])),
    propulsion: { afterburner: 0, mwd: 0, mjd: 0 },
  });
  const f = fit([
    ['low', 0, 11],
    ['medium', 0, 1],
  ]);

  it('adds a group at or above the threshold to the moves, after every move without it', () => {
    const base = catalogue(TYPES).moves()(f);
    const withData = catalogue(TYPES).moves({ commonality: common({ 99999: 0.3 }) })(f);
    expect(withData.slice(0, base.length).map(label)).toEqual(base.map(label));
    const added = withData.slice(base.length).map(label);
    expect(added).toContain('11>13@l0');
    expect(base.map(label)).not.toContain('11>13@l0');
  });

  it('never removes a move, and a group under the threshold adds none', () => {
    const base = catalogue(TYPES).moves()(f).map(label);
    expect(
      catalogue(TYPES)
        .moves({ commonality: common({ 99999: 0.24 }) })(f)
        .map(label)
    ).toEqual(base);
    expect(catalogue(TYPES).moves({ commonality: null })(f).map(label)).toEqual(base);
  });

  it('still obeys the filters: no second Damage Control, no tank module in a freed tank', () => {
    const list = catalogue(TYPES)
      .moves({ commonality: common({ 60: 0.9 }), defense: 'shield' })(
        fit([
          ['low', 0, 10],
          ['low', 1, 11],
        ])
      )
      .map(label);
    expect(list.some((l) => l.startsWith('11>10'))).toBe(false);
  });

  describe('the tie-break', () => {
    const types: Record<number, Type> = {
      40: { group: 57, rack: 'low', meta: 2, ehp: 0 },
      41: { group: 1156, rack: 'low', meta: 2, ehp: 1000 },
      42: { group: 770, rack: 'low', meta: 2, ehp: 1005 },
      43: { group: 770, rack: 'low', meta: 2, ehp: 1100 },
      50: { group: 38, rack: 'medium', meta: 2, ehp: 0 },
      51: { group: 77, rack: 'medium', meta: 2, ehp: 500 },
    };
    const start = fit([
      ['low', 0, 40],
      ['medium', 0, 50],
    ]);
    // Moves from whatever the fit holds now, as the real move list is.
    const moveList =
      (to: number) =>
      (current: Fitting): ImproveCandidate[] => {
        const low = current.modules.find((m) => m.slot === 'low')?.typeId ?? 40;
        return [
          ...[to, 41]
            .filter((target) => target !== low)
            .map((target) => ({
              fromTypeId: low,
              toTypeId: target,
              at: [{ slot: 'low' as const, slotIndex: 0 }],
            })),
          { fromTypeId: 50, toTypeId: 51, at: [{ slot: 'medium' as const, slotIndex: 0 }] },
        ];
      };
    const run = (to: number, targetShare?: (m: ImproveCandidate) => number) =>
      search(start, { moves: moveList(to), ...(targetShare ? { targetShare } : {}) }, types).then(
        ({ result }) => result?.makeover?.rows.map(label) ?? []
      );
    const prefers41 = (m: ImproveCandidate) => (m.toTypeId === 41 ? 0.9 : 0.1);

    it('picks the more common target group when the gains are within 1%', async () => {
      expect(await run(42)).toContain('40>42@l0');
      expect(await run(42, prefers41)).toContain('40>41@l0');
    });

    it('keeps the larger gain when it is more than 1% ahead', async () => {
      expect(await run(43, prefers41)).toContain('40>43@l0');
    });
  });
});

describe('the propulsion a job needs (#5578)', () => {
  // 1 extender and 2 hardener (mediums), 11 and 10 the lows (a Damage Control gain keeps the Makeover over one row),
  // 20 an afterburner, 21 an MWD, 22 a Large and 23 a Medium Micro Jump Drive.
  const types: Record<number, Type> = {
    1: { group: 38, rack: 'medium', meta: 2, ehp: 150 },
    2: { group: 77, rack: 'medium', meta: 2, ehp: 120 },
    10: { group: 60, rack: 'low', meta: 2, ehp: 200 },
    11: { group: 57, rack: 'low', meta: 2, ehp: 20 },
    20: { group: 46, rack: 'medium', meta: 2, ehp: 0, name: '10MN Afterburner II' },
    21: { group: 46, rack: 'medium', meta: 2, ehp: 0, name: '50MN Microwarpdrive II' },
    22: { group: 1189, rack: 'medium', meta: 1, ehp: 0, name: 'Large Micro Jump Drive' },
    23: { group: 1189, rack: 'medium', meta: 1, ehp: 0, name: 'Medium Micro Jump Drive' },
  };
  const noProp = () =>
    fit([
      ['medium', 0, 2],
      ['medium', 1, 1],
      ['low', 0, 11],
      ['low', 1, 11],
    ]);
  const common = (propulsion: Partial<JobCommonality['propulsion']>): JobCommonality => ({
    fits: 20,
    groupShare: new Map(),
    propulsion: { afterburner: 0, mwd: 0, mjd: 0, ...propulsion },
  });

  /** A Makeover of `fitting` under the job, with the propulsion the job needs. */
  async function run(
    fitting: Fitting,
    extra: Partial<MakeoverMoveOptions> = {},
    // A cruiser: no Large Micro Jump Drive.
    flyable: (slot: FittingSlotKind, typeId: number) => boolean = (_slot, typeId) => typeId !== 22
  ) {
    const { index, rackOf, options } = catalogue(types);
    const base = options(extra);
    const opts: MakeoverMoveOptions = {
      ...base,
      pool: { ...base.pool, flyable },
    };
    const { result } = await search(
      fitting,
      {
        jobSetting: opts.jobSetting,
        moves: (f) => makeoverMoves(f.modules, index, rackOf, opts),
        propulsion: propulsionStart(index, rackOf, opts),
        bestSingle: 0,
      },
      types,
      {}
    );
    return result?.makeover?.rows ?? [];
  }

  it('PvE adds a propulsion module in the slot that costs the least score, and the row says why', async () => {
    const rows = await run(noProp(), { jobSetting: jobSettingOf('pve') });
    const added = rows.find((row) => row.addsPropulsionFor);
    expect(added && label(added)).toBe('2>20@m0');
    expect(added?.addsPropulsionFor).toBe('pve');
  });

  it('fills a free medium slot before it costs a module', async () => {
    const rows = await run(
      fit([
        ['medium', 0, 2],
        ['low', 0, 11],
        ['low', 1, 11],
      ]),
      { jobSetting: jobSettingOf('pve') }
    );
    expect(rows.map(label)).toContain('->20@m1');
  });

  it('with the opt-out, PvE adds none', async () => {
    const rows = await run(noProp(), { jobSetting: jobSettingOf('pve', 'dangerous', true) });
    expect(rows.some((row) => [20, 21, 22, 23].includes(row.toTypeId))).toBe(false);
  });

  it('PvP adds none', async () => {
    const rows = await run(noProp(), { jobSetting: jobSettingOf('pvp') });
    expect(rows.some((row) => [20, 21, 22, 23].includes(row.toTypeId))).toBe(false);
  });

  it('Explore adds an MWD, never an afterburner', async () => {
    const rows = await run(noProp(), { jobSetting: jobSettingOf('explore', 'safe') });
    expect(rows.find((row) => row.addsPropulsionFor)?.toTypeId).toBe(21);
  });

  it('leaves a fit that has propulsion alone', async () => {
    const rows = await run(
      fit([
        ['medium', 0, 20],
        ['medium', 1, 1],
        ['low', 0, 11],
        ['low', 1, 11],
      ]),
      { jobSetting: jobSettingOf('pve') }
    );
    expect(rows.some((row) => row.addsPropulsionFor)).toBe(false);
  });

  describe('a hull that can fit a Large Micro Jump Drive', () => {
    const battleship = (_slot: FittingSlotKind, typeId: number) => typeId !== 23;

    it('gets one without data on the hull', async () => {
      const rows = await run(noProp(), { jobSetting: jobSettingOf('pve') }, battleship);
      expect(rows.find((row) => row.addsPropulsionFor)?.toTypeId).toBe(22);
    });

    it('takes what the hull fits mostly carry over that rule', async () => {
      const rows = await run(
        noProp(),
        { jobSetting: jobSettingOf('pve'), commonality: common({ mwd: 0.8 }) },
        (_slot, typeId) => typeId !== 23
      );
      expect(rows.find((row) => row.addsPropulsionFor)?.toTypeId).toBe(21);
    });

    it('falls back to an afterburner or MWD where no jump drive passes', async () => {
      const rows = await run(noProp(), { jobSetting: jobSettingOf('pve') }, (_slot, typeId) =>
        [20, 21, 1, 2, 10, 11].includes(typeId)
      );
      expect([20, 21]).toContain(rows.find((row) => row.addsPropulsionFor)?.toTypeId);
    });
  });

  describe('tiers', () => {
    it('PvE: the common kind, then the rules; PvP: none; Explore: MWD', () => {
      expect(propulsionTiers(jobSettingOf('pve'), common({ afterburner: 0.7 }), false)).toEqual([
        ['afterburner'],
        ['afterburner', 'mwd'],
      ]);
      expect(propulsionTiers(jobSettingOf('pve'), null, true)).toEqual([
        ['mjd'],
        ['afterburner', 'mwd'],
      ]);
      expect(propulsionTiers(jobSettingOf('pve'), null, false)).toEqual([['afterburner', 'mwd']]);
      expect(propulsionTiers(jobSettingOf('pve', 'dangerous', true), null, true)).toEqual([]);
      expect(propulsionTiers(jobSettingOf('pvp'), null, true)).toEqual([]);
      expect(propulsionTiers(jobSettingOf('explore'), common({ afterburner: 0.9 }), true)).toEqual([
        ['mwd'],
      ]);
      expect(propulsionTiers(undefined, null, true)).toEqual([]);
    });
  });

  describe('single swaps and moves', () => {
    const labels = (fitting: Fitting, extra: Partial<MakeoverMoveOptions>) =>
      catalogue(types).moves(extra)(fitting).map(label);
    const withMjd = fit([
      ['medium', 0, 22],
      ['medium', 1, 1],
    ]);
    const withMwd = fit([
      ['medium', 0, 21],
      ['medium', 1, 1],
    ]);

    it('PvE never removes a fitted micro jump drive, nor trades it for another kind', () => {
      const list = labels(withMjd, { jobSetting: jobSettingOf('pve'), goal: 'overall' });
      expect(list.filter((l) => l.startsWith('22>') && !l.startsWith('22>23'))).toEqual([]);
    });

    it('Explore never turns an MWD into an afterburner', () => {
      const explore = labels(withMwd, { jobSetting: jobSettingOf('explore'), goal: 'overall' });
      expect(explore.filter((l) => l.startsWith('21>20'))).toEqual([]);
      // PvE may still: the score decides.
      const pve = labels(withMwd, { jobSetting: jobSettingOf('pve'), goal: 'overall' });
      expect(pve).toContain('21>20@m0');
    });

    it('Explore single swaps follow the same rule', () => {
      const { index, rackOf, options } = catalogue(types);
      const pool = options().pool;
      const found = improveCandidates(withMwd.modules, index, rackOf, {
        goal: 'overall',
        reach: 'rework',
        pool,
        jobSetting: jobSettingOf('explore'),
      });
      expect(found.some((c) => c.fromTypeId === 21 && c.toTypeId === 20)).toBe(false);
    });
  });
});
