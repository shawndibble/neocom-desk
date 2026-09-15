import { describe, it, expect } from 'vitest';
import {
  valueMiningYield,
  type GeneralReprocessingSkills,
  type YieldReprocessingEntry,
} from './yieldValuation';
import type { OreLine } from './types';

const VELDSPAR = 1230;
const ICE = 16262;
const UNREPROCESSABLE = 99;

// Real SDE skill type ids (issue #1058), so a mixed-line test can show each
// resolves independently rather than sharing one blended specialisation.
const SIMPLE_ORE_PROCESSING = 60377;
const ICE_PROCESSING = 18025;
const SCRAPMETAL_PROCESSING = 12196;

const NO_SKILLS: GeneralReprocessingSkills = {
  reprocessingLevel: 0,
  reprocessingEfficiencyLevel: 0,
};
const NO_TRAINED = new Map<number, { level: number }>();

describe('valueMiningYield', () => {
  it('values every line at its mined-date raw price and sums to the entry total', () => {
    const lines: OreLine[] = [
      { typeId: VELDSPAR, quantity: 1000 },
      { typeId: ICE, quantity: 100 },
    ];
    const rawPrices = new Map([
      [VELDSPAR, 5],
      [ICE, 40],
    ]);

    const result = valueMiningYield(lines, rawPrices, new Map(), NO_SKILLS, NO_TRAINED, {});

    // 1000*5 + 100*40 = 9000
    expect(result.rawValue).toBe(9000);
    expect(result.lines.map((l) => l.rawValue)).toEqual([5000, 4000]);
  });

  it('computes refine-then-sell value from reprocessing yield and material prices', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 200 }];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [VELDSPAR, { portionSize: 100, materials: [{ typeId: 34, quantity: 400 }] }],
    ]);

    const result = valueMiningYield(
      lines,
      new Map([[VELDSPAR, 5]]),
      reprocessing,
      NO_SKILLS,
      NO_TRAINED,
      { 34: 3 }
    );

    // 200 units / 100 portion = 2 batches; 2*400*0.5 (base station rate) = 400 units of material 34
    expect(result.refineValue).toBe(400 * 3);
    expect(result.pricedAll).toBe(true);
  });

  it('marks the entry Partial when a line has no mined-date raw price', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 100 }];
    const result = valueMiningYield(lines, new Map(), new Map(), NO_SKILLS, NO_TRAINED, {});
    expect(result.pricedAll).toBe(false);
    expect(result.lines[0].rawValue).toBe(0);
  });

  it('marks the entry Partial when a line has no reprocessing data at all', () => {
    const lines: OreLine[] = [{ typeId: UNREPROCESSABLE, quantity: 100 }];
    const result = valueMiningYield(
      lines,
      new Map([[UNREPROCESSABLE, 5]]),
      new Map(),
      NO_SKILLS,
      NO_TRAINED,
      {}
    );
    expect(result.pricedAll).toBe(false);
    expect(result.lines[0].refineValue).toBe(0);
  });

  it('marks the entry Partial when a refine output material has no price', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 200 }];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [VELDSPAR, { portionSize: 100, materials: [{ typeId: 34, quantity: 400 }] }],
    ]);

    const result = valueMiningYield(
      lines,
      new Map([[VELDSPAR, 5]]),
      reprocessing,
      NO_SKILLS,
      NO_TRAINED,
      {}
    );

    expect(result.pricedAll).toBe(false);
    expect(result.refineValue).toBe(0);
  });

  it('returns zero totals for an empty ore-line list', () => {
    const result = valueMiningYield([], new Map(), new Map(), NO_SKILLS, NO_TRAINED, {});
    expect(result).toEqual({
      rawValue: 0,
      refineValue: 0,
      pricedAll: true,
      lines: [],
      efficiency: 0.5,
    });
  });
});

describe('valueMiningYield line detail (issue: Mining Yield row detail)', () => {
  it('carries each line the materials it actually refines into', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 250 }];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [VELDSPAR, { portionSize: 100, materials: [{ typeId: 34, quantity: 400 }] }],
    ]);

    const result = valueMiningYield(
      lines,
      new Map([[VELDSPAR, 5]]),
      reprocessing,
      NO_SKILLS,
      NO_TRAINED,
      { 34: 3 }
    );

    // 250 units / 100 portion = 2 whole batches, 50 units left over.
    expect(result.lines[0].refineOutputs).toEqual([{ typeId: 34, quantity: 400 }]);
    expect(result.lines[0].batches).toBe(2);
    expect(result.lines[0].unitsLeftOver).toBe(50);
  });

  it('reports no outputs and the whole quantity left over below one portion', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 60 }];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [VELDSPAR, { portionSize: 100, materials: [{ typeId: 34, quantity: 400 }] }],
    ]);

    const result = valueMiningYield(
      lines,
      new Map([[VELDSPAR, 5]]),
      reprocessing,
      NO_SKILLS,
      NO_TRAINED,
      {}
    );

    expect(result.lines[0].refineOutputs).toEqual([]);
    expect(result.lines[0].batches).toBe(0);
    expect(result.lines[0].unitsLeftOver).toBe(60);
  });

  it('reports a line with no reprocessing data as nothing refined, not a part batch', () => {
    const lines: OreLine[] = [{ typeId: UNREPROCESSABLE, quantity: 100 }];
    const result = valueMiningYield(
      lines,
      new Map([[UNREPROCESSABLE, 5]]),
      new Map(),
      NO_SKILLS,
      NO_TRAINED,
      {}
    );

    expect(result.lines[0].refineOutputs).toEqual([]);
    expect(result.lines[0].batches).toBe(0);
    expect(result.lines[0].unitsLeftOver).toBe(0);
  });

  it('reports the general-skills reprocessing efficiency the UI states, at the NPC station base rate', () => {
    const result = valueMiningYield([], new Map(), new Map(), NO_SKILLS, NO_TRAINED, {});
    // NPC station's 50% base rate with no skills — the assumption the UI must state.
    // Deliberately excludes specialisation (issue #1058): a mixed entry can
    // refine ore and ice under two different specialisations at once, so no
    // single number could state that part honestly. `refineBasisHint` only
    // ever names the two general skills, never a specialisation.
    expect(result.efficiency).toBe(0.5);
  });
});

describe('valueMiningYield per-type specialisation (issue #1058)', () => {
  it('resolves each line against its own specialisation skill, not one shared across the entry', () => {
    const lines: OreLine[] = [
      { typeId: VELDSPAR, quantity: 100 },
      { typeId: ICE, quantity: 100 },
    ];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [
        VELDSPAR,
        {
          portionSize: 100,
          materials: [{ typeId: 34, quantity: 100 }],
          specialisationSkillId: SIMPLE_ORE_PROCESSING,
        },
      ],
      [
        ICE,
        {
          portionSize: 100,
          materials: [{ typeId: 34, quantity: 100 }],
          specialisationSkillId: ICE_PROCESSING,
        },
      ],
    ]);
    // Trained Simple Ore Processing V but not Ice Processing at all.
    const trained = new Map([[SIMPLE_ORE_PROCESSING, { level: 5 }]]);

    const result = valueMiningYield(
      lines,
      new Map([
        [VELDSPAR, 5],
        [ICE, 5],
      ]),
      reprocessing,
      NO_SKILLS,
      trained,
      { 34: 1 }
    );

    // Veldspar: 0.5 base * (1 + 0.02*5) = 0.55 -> floor(100*0.55) = 55
    expect(result.lines[0].refineOutputs).toEqual([{ typeId: 34, quantity: 55 }]);
    // Ice: untrained Ice Processing -> base rate only -> floor(100*0.5) = 50
    expect(result.lines[1].refineOutputs).toEqual([{ typeId: 34, quantity: 50 }]);
  });

  it('falls back to Scrapmetal Processing for a type with no specialisation attribute', () => {
    const lines: OreLine[] = [{ typeId: UNREPROCESSABLE, quantity: 100 }];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [UNREPROCESSABLE, { portionSize: 100, materials: [{ typeId: 34, quantity: 100 }] }],
    ]);
    const trained = new Map([[SCRAPMETAL_PROCESSING, { level: 5 }]]);

    const result = valueMiningYield(
      lines,
      new Map([[UNREPROCESSABLE, 5]]),
      reprocessing,
      NO_SKILLS,
      trained,
      { 34: 1 }
    );

    // 0.5 base * (1 + 0.02*5) = 0.55 -> floor(100*0.55) = 55
    expect(result.lines[0].refineOutputs).toEqual([{ typeId: 34, quantity: 55 }]);
  });
});
