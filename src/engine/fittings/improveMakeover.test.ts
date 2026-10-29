import { describe, expect, it } from 'vitest';
import { applyImproveCandidate, type CandidateOptions, type ImproveCandidate } from './improve';
import { findMakeover, makeoverMoves } from './improveMakeover';
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
  16: { group: 1156, rack: 'low', meta: 1, ehp: 500, cpu: 5, capUnstable: true },
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
  const options = (extra: Partial<CandidateOptions> = {}): Partial<CandidateOptions> => ({
    goal: 'tank',
    defense: 'keep',
    includeRigs: false,
    includeOfficer: false,
    slotCounts: { high: 0, medium: 2, low: 2, rig: 0, subsystem: 0 },
    pool: {
      groupOf: (id) => types[id]?.group,
      typeIdsInGroup: (group) => ids.filter((id) => types[id].group === group),
      published: () => true,
    },
    ...extra,
  });
  const moves =
    (extra: Partial<CandidateOptions> = {}) =>
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
  moveOptions: Partial<CandidateOptions> = {}
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
    const { result } = await search(
      fit([
        ['low', 0, 11],
        ['low', 1, 11],
      ])
    );
    expect(result?.makeover?.fitting.modules.some((m) => m.typeId === 16)).toBe(false);
    expect(result?.makeover?.after.capacitor.stable).toBe(true);
  });

  it('stops at the calculation cap and keeps the best fit so far', async () => {
    const f = fit([
      ['medium', 0, 1],
      ['medium', 1, 5],
      ['low', 0, 11],
      ['low', 1, 11],
    ]);
    const { result, calls } = await search(f, { maxCalcs: 12 });
    expect(result?.stopped).toBe(true);
    expect(calls).toBeLessThanOrEqual(13);
  });

  it('Show best so far ends the search', async () => {
    let asked = 0;
    const { result } = await search(
      fit([
        ['low', 0, 11],
        ['low', 1, 11],
      ]),
      {
        shouldStop: () => ++asked > 1,
      }
    );
    expect(result?.stopped).toBe(true);
  });

  it('Cancel returns null', async () => {
    const { result } = await search(fit([['low', 0, 11]]), { isCancelled: () => true });
    expect(result).toBeNull();
  });

  it('shows no makeover when it does not beat the best single move', async () => {
    const { result } = await search(fit([['low', 0, 11]]), {}, TYPES, {
      slotCounts: { high: 0, medium: 0, low: 1, rig: 0, subsystem: 0 },
    });
    expect(result).not.toBeNull();
    expect(result?.makeover).toBeNull();
  });
});
