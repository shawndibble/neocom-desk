import { describe, expect, it } from 'vitest';
import {
  applyImproveCandidate,
  conversionKey,
  conversionSummary,
  findImprovements,
  improveCandidates,
  iskDeltaOf,
  MAX_CANDIDATES,
  type CandidateOptions,
  type ImproveCandidate,
} from './improve';
import { buildVariationIndex } from '../market/variations';
import type { Fitting, FittingSlotKind, FittingStats } from './types';
import { baseFittingStats } from './__fixtures__/fittingStats';

// 101/102 shield extenders (38, mid), 103 shield booster (40, mid), 201/202 armor plates
// (329, low), 203 armor repairer (62, low), 204 armor hardener (328, low), 301 MWD (46),
// 302 scram (52), 303 web (65), 304 cap recharger (43) — all mid — 305 gyrostabilizer
// (59, low), 306 heat sink (205, low), 307 damage control (60, low), 401 armor rig (773).
const GROUP: Record<number, number> = {
  101: 38,
  102: 38,
  103: 40,
  201: 329,
  202: 329,
  203: 62,
  204: 328,
  301: 46,
  302: 52,
  303: 65,
  304: 43,
  305: 59,
  306: 205,
  307: 60,
  401: 773,
};
const RACK: Record<number, FittingSlotKind> = {
  101: 'medium',
  102: 'medium',
  103: 'medium',
  201: 'low',
  202: 'low',
  203: 'low',
  204: 'low',
  301: 'medium',
  302: 'medium',
  303: 'medium',
  304: 'medium',
  305: 'low',
  306: 'low',
  307: 'low',
  401: 'rig',
};
const rackOf = Object.fromEntries(Object.entries(RACK).map(([id, rack]) => [id, rack]));
const index = buildVariationIndex(
  {
    101: { parentTypeId: null, metaGroupId: 1 },
    102: { parentTypeId: 101, metaGroupId: 2 },
    201: { parentTypeId: null, metaGroupId: 1 },
    202: { parentTypeId: 201, metaGroupId: 2 },
  },
  { 1: 'Tech I', 2: 'Tech II' }
);

const base: CandidateOptions = {
  goal: 'tank',
  reach: 'rebalance',
  defense: 'armor',
  includeRigs: false,
  includeOfficer: false,
  slotCounts: { high: 0, medium: 5, low: 5, rig: 3, subsystem: 0 },
  pool: {
    groupOf: (id) => GROUP[id],
    typeIdsInGroup: (group) =>
      Object.keys(GROUP)
        .map(Number)
        .filter((id) => GROUP[id] === group),
    published: () => true,
  },
};

const fit = (modules: [FittingSlotKind, number, number][]): Fitting =>
  ({
    shipTypeId: 1,
    name: 'T',
    modules: modules.map(([slot, slotIndex, typeId]) => ({ slot, slotIndex, typeId })),
  }) as unknown as Fitting;

// A shield tank: two extenders, MWD, scram, web, cap recharger; lows have a free slot.
const shieldFit = fit([
  ['medium', 0, 101],
  ['medium', 1, 101],
  ['medium', 2, 301],
  ['medium', 3, 302],
  ['medium', 4, 303],
  ['low', 0, 305],
  ['low', 1, 305],
  ['low', 2, 306],
  ['low', 3, 307],
]);
// An armor tank: two plates, a repairer; mids hold only tackle, so two are free.
const armorFit = fit([
  ['medium', 0, 301],
  ['medium', 1, 302],
  ['medium', 2, 304],
  ['low', 0, 201],
  ['low', 1, 201],
  ['low', 2, 203],
  ['low', 3, 305],
]);

const candidates = (f: Fitting, over: Partial<CandidateOptions> = {}) =>
  improveCandidates(f.modules, index, rackOf, { ...base, ...over });
const conversions = (list: ImproveCandidate[]) => list.filter((c) => c.conversion);
const typesOf = (f: Fitting) => f.modules.map((m) => m.typeId);

describe('Improve whole-tank conversion', () => {
  it('shield fit with a free low slot offers an armor conversion', () => {
    const [first] = conversions(candidates(shieldFit));
    expect(first).toBeDefined();
    expect(first!.conversion!.side).toBe('armor');
    expect(first!.conversion!.removes).toEqual([
      {
        typeId: 101,
        at: [
          { slot: 'medium', slotIndex: 0 },
          { slot: 'medium', slotIndex: 1 },
        ],
      },
    ]);
    expect(first!.conversion!.freed).toEqual({ high: 0, medium: 2, low: 0 });
    expect(GROUP[first!.toTypeId]).toBe(329);
  });

  it('applying it removes the shield tank, keeps the tackle and fills the armor rack', () => {
    const [first] = conversions(candidates(shieldFit));
    const after = applyImproveCandidate(shieldFit, first!);
    expect(typesOf(after)).not.toContain(101);
    for (const kept of [301, 302, 303, 305, 306, 307]) expect(typesOf(after)).toContain(kept);
    expect(after.modules.filter((m) => m.slot === 'medium')).toHaveLength(3);
    const lows = after.modules.filter((m) => m.slot === 'low');
    expect(lows).toHaveLength(5);
    expect(lows.some((m) => GROUP[m.typeId] === 329)).toBe(true);
  });

  it('armor fit offers a shield conversion that fills the mids and frees the lows', () => {
    const list = conversions(candidates(armorFit, { defense: 'shield' }));
    expect(list.length).toBeGreaterThan(0);
    const [first] = list;
    expect(first!.conversion!.side).toBe('shield');
    expect(first!.conversion!.freed).toEqual({ high: 0, medium: 0, low: 3 });
    const after = applyImproveCandidate(armorFit, first!);
    expect(typesOf(after)).not.toContain(201);
    expect(typesOf(after)).not.toContain(203);
    for (const kept of [301, 302, 304, 305]) expect(typesOf(after)).toContain(kept);
    expect(after.modules.filter((m) => m.slot === 'medium')).toHaveLength(5);
  });

  it('never strips or displaces scram, web, cap, propulsion or damage control', () => {
    const full = fit([
      ['medium', 0, 301],
      ['medium', 1, 302],
      ['medium', 2, 303],
      ['medium', 3, 304],
      ['medium', 4, 101],
      ['low', 0, 305],
      ['low', 1, 305],
      ['low', 2, 306],
      ['low', 3, 307],
      ['low', 4, 306],
    ]);
    const list = conversions(candidates(full));
    expect(list.length).toBeGreaterThan(0);
    for (const c of list) {
      const gone = c.conversion!.removes.map((r) => r.typeId);
      for (const keep of [301, 302, 303, 304, 307]) expect(gone).not.toContain(keep);
    }
  });

  it('a full chosen-side rack gives up its weakest unprotected modules, a few counts', () => {
    const full = fit([
      ['medium', 0, 101],
      ['low', 0, 305],
      ['low', 1, 305],
      ['low', 2, 306],
      ['low', 3, 306],
      ['low', 4, 307],
    ]);
    const list = conversions(candidates(full));
    const removed = list.map((c) => c.conversion!.removes.flatMap((r) => r.at).length);
    expect(Math.min(...removed)).toBe(2);
    expect(Math.max(...removed)).toBe(4);
    for (const c of list) expect(c.conversion!.removes.map((r) => r.typeId)).not.toContain(307);
  });

  it('is not offered when the Defense Choice is Keep, the goal is not a tank goal, or Reach is Upgrade', () => {
    expect(conversions(candidates(shieldFit, { defense: 'keep' }))).toEqual([]);
    expect(conversions(candidates(shieldFit, { goal: 'damage' }))).toEqual([]);
    expect(conversions(candidates(shieldFit, { reach: 'upgrade' }))).toEqual([]);
  });

  it('is not offered when the fit has no tank on the other side', () => {
    expect(conversions(candidates(shieldFit, { defense: 'shield' }))).toEqual([]);
    expect(conversions(candidates(armorFit, { defense: 'armor' }))).toEqual([]);
  });

  // v1 never strips a rig, even with Include rigs ticked.
  it('never strips a rig, even when rigs are included', () => {
    const withRig = fit([
      ...shieldFit.modules.map((m): [FittingSlotKind, number, number] => [
        m.slot,
        m.slotIndex,
        m.typeId,
      ]),
      ['rig', 0, 401],
    ]);
    for (const c of conversions(candidates(withRig, { includeRigs: true })))
      expect(c.conversion!.removes.map((r) => r.typeId)).not.toContain(401);
  });

  it('costs the new modules less the removed ones', () => {
    const [first] = conversions(candidates(shieldFit));
    const price = (id: number) => (id === 101 ? 10 : 100);
    const adds = typesOf(applyImproveCandidate(shieldFit, first!)).filter(
      (t) => GROUP[t] === 329 || GROUP[t] === 62 || GROUP[t] === 328
    ).length;
    const expected = adds * 100 - 2 * 10;
    expect(iskDeltaOf(first!, price)).toBe(expected);
    expect(iskDeltaOf(first!, (id) => (id === 101 ? null : 100))).toBeNull();
  });

  it('stays within the candidate cap', () => {
    expect(candidates(shieldFit, { limit: 3 })).toHaveLength(3);
    expect(candidates(shieldFit).length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(conversions(candidates(shieldFit)).length).toBeLessThanOrEqual(30);
  });

  describe('scored whole by findImprovements', () => {
    // Extenders are worth 500 EHP each (1000 for the pair), CPU 10 each; the armor plate's figures vary.
    const run = async (plateEhp: number, plateCpu: number) => {
      const model = async (f: Fitting): Promise<FittingStats> => {
        const b = baseFittingStats();
        const sum = (per: (id: number) => number) =>
          f.modules.reduce((n, m) => n + per(m.typeId), 0);
        return {
          ...b,
          cpuTotal: 100,
          cpuUsed: sum((id) => (id === 101 ? 10 : GROUP[id] === 329 ? plateCpu : 0)),
          ehp: b.ehp + sum((id) => (id === 101 ? 500 : GROUP[id] === 329 ? plateEhp : 0)),
        } as FittingStats;
      };
      const result = await findImprovements({
        fitting: shieldFit,
        before: await model(shieldFit),
        goal: 'tank',
        candidates: conversions(candidates(shieldFit)),
        stats: model,
        priceOf: () => 1,
      });
      if (!result) throw new Error('cancelled');
      return result;
    };
    const shown = (r: Awaited<ReturnType<typeof run>>) =>
      [...r.noDownside, ...r.tradeOffs].filter((o) => o.candidate.conversion);

    it('keeps a conversion whose whole fit beats the current one', async () => {
      const result = await run(1500, 20);
      expect(shown(result).length).toBeGreaterThan(0);
      expect(shown(result)[0]!.score).toBeGreaterThan(0);
    });

    it('rejects one that breaks the CPU budget with the budget guardrail', async () => {
      const result = await run(1500, 200);
      expect(shown(result)).toEqual([]);
      const rejected = result.rejected.filter((o) => o.candidate.conversion);
      expect(rejected.length).toBeGreaterThan(0);
      expect(rejected.every((o) => o.guardrail === 'budget')).toBe(true);
    });

    it('leaves one that scores worse out altogether', async () => {
      const result = await run(100, 20);
      expect(shown(result)).toEqual([]);
      expect(result.rejected.filter((o) => o.candidate.conversion)).toEqual([]);
    });
  });

  describe('keeps the sustained tank', () => {
    // The fit starts with `beforeSustained` sustained tank; a converted or swapped fit has `kept`.
    const run = async (beforeSustained: number, kept: number, conversion: boolean) => {
      const model = async (f: Fitting): Promise<FittingStats> => {
        const b = baseFittingStats();
        const converted = f.modules.some((m) => GROUP[m.typeId] === 329);
        const swapped = f.modules.some((m) => m.typeId === 102);
        const sustained = converted || swapped ? kept : beforeSustained;
        return {
          ...b,
          cpuTotal: 100,
          cpuUsed: 0,
          ehp: b.ehp + (converted ? 1500 : swapped ? 100 : 0),
          tank: { ...b.tank, sustainedEffective: sustained },
        } as FittingStats;
      };
      const candidate: ImproveCandidate = conversion
        ? conversions(candidates(shieldFit))[0]!
        : {
            fromTypeId: 101,
            toTypeId: 102,
            at: [
              { slot: 'medium', slotIndex: 0 },
              { slot: 'medium', slotIndex: 1 },
            ],
          };
      const result = await findImprovements({
        fitting: shieldFit,
        before: await model(shieldFit),
        goal: 'tank',
        candidates: [candidate],
        stats: model,
        priceOf: () => 1,
      });
      if (!result) throw new Error('cancelled');
      return {
        kept: [...result.noDownside, ...result.tradeOffs],
        rejected: result.rejected,
      };
    };

    it('rejects a conversion that loses more than half of it', async () => {
      const result = await run(1000, 400, true);
      expect(result.kept).toEqual([]);
      expect(result.rejected.map((o) => o.guardrail)).toEqual(['keepsTank']);
    });

    it('keeps a conversion that holds at least half of it', async () => {
      const result = await run(1000, 500, true);
      expect(result.kept.length).toBe(1);
      expect(result.rejected).toEqual([]);
    });

    it('never holds back a fit with no sustained tank', async () => {
      const result = await run(0, 0, true);
      expect(result.kept.length).toBe(1);
      expect(result.rejected).toEqual([]);
    });

    it('does not hold back an ordinary swap', async () => {
      const result = await run(1000, 100, false);
      expect(result.rejected.filter((o) => o.guardrail === 'keepsTank')).toEqual([]);
      expect(result.kept.length).toBe(1);
    });
  });

  it('offers more than one size per group', () => {
    const roots = conversions(candidates(shieldFit)).map((c) => c.toTypeId);
    expect(roots).toContain(201);
    expect(roots).toContain(202);
  });

  it('lists conversions ahead of everything else, so the cap never cuts them', () => {
    const many = 450;
    const manyPlates = (group: number) =>
      group === 329
        ? [201, 202, ...Array.from({ length: many }, (_, i) => 1000 + i)]
        : (base.pool!.typeIdsInGroup(group) as number[]);
    const crowdedRack = {
      ...rackOf,
      ...Object.fromEntries(Array.from({ length: many }, (_, i) => [1000 + i, 'low'])),
    };
    const list = improveCandidates(shieldFit.modules, index, crowdedRack, {
      ...base,
      reach: 'rework',
      limit: 5,
      pool: {
        ...base.pool!,
        typeIdsInGroup: manyPlates,
        groupOf: (id) => (id >= 1000 ? 329 : GROUP[id]),
      },
    });
    expect(list).toHaveLength(5);
    expect(list.every((c) => c.conversion)).toBe(true);
  });

  it('names a conversion and counts what it removes, adds and frees', () => {
    const [first] = conversions(candidates(shieldFit));
    expect(conversionKey(first!.conversion!)).toContain('armor');
    expect(conversionSummary(first!)).toEqual({
      removed: 2,
      added: 1,
      swapped: 0,
      freed: { high: 0, medium: 2, low: 0 },
    });
    const downgrade: ImproveCandidate = {
      fromTypeId: 301,
      toTypeId: 301,
      at: [{ slot: 'medium', slotIndex: 2 }],
    };
    const chained = { ...first!, pairedWith: { ...first!.pairedWith, ...downgrade } };
    expect(conversionSummary(chained).swapped).toBe(1);
    expect(conversionSummary(chained).added).toBe(1);
  });

  it('an over-budget conversion is never paired with a downgrade', async () => {
    let calls = 0;
    const model = async (f: Fitting): Promise<FittingStats> => {
      calls++;
      const b = baseFittingStats();
      const cpu = (id: number) => (id === 101 ? 10 : id === 102 ? 0 : GROUP[id] === 329 ? 105 : 0);
      return {
        ...b,
        cpuTotal: 100,
        cpuUsed: f.modules.reduce((n, m) => n + cpu(m.typeId), 0),
        ehp: b.ehp + f.modules.reduce((n, m) => n + (GROUP[m.typeId] === 329 ? 1500 : 0), 0),
      } as FittingStats;
    };
    const [conversion] = conversions(candidates(shieldFit));
    const before = await model(shieldFit);
    calls = 0;
    const result = await findImprovements({
      fitting: shieldFit,
      before,
      goal: 'tank',
      candidates: [
        conversion!,
        {
          fromTypeId: 101,
          toTypeId: 102,
          at: [
            { slot: 'medium', slotIndex: 0 },
            { slot: 'medium', slotIndex: 1 },
          ],
        },
      ],
      stats: model,
      priceOf: () => 1,
    });
    // The conversion and the swap are the only two calculations: no pair move was built.
    expect(calls).toBe(2);
    const all = [...result!.noDownside, ...result!.tradeOffs, ...result!.rejected];
    expect(all.filter((o) => o.candidate.conversion).every((o) => o.candidate === conversion)).toBe(
      true
    );
  });
});
