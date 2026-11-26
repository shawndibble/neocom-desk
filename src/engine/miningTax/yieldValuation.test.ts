import { describe, it, expect } from 'vitest';
import { valueMiningYield, type YieldReprocessingEntry } from './yieldValuation';
import { characterModifiers, NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import type { OreLine } from './types';

const VELDSPAR = 1230;
const ICE = 16262;
const UNREPROCESSABLE = 99;

const SIMPLE_ORE_PROCESSING = 60377;
const ICE_PROCESSING = 18025;
const SCRAPMETAL_PROCESSING = 12196;

const NO_SKILLS = NO_CHARACTER_MODIFIERS;
const RX_804 = 27174;

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

    const result = valueMiningYield(lines, rawPrices, new Map(), NO_SKILLS, {});

    expect(result.rawValue).toBe(9000);
    expect(result.lines.map((l) => l.rawValue)).toEqual([5000, 4000]);
  });

  it('computes refine-then-sell value from reprocessing yield and material prices', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 200 }];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [VELDSPAR, { portionSize: 100, materials: [{ typeId: 34, quantity: 400 }] }],
    ]);

    const result = valueMiningYield(lines, new Map([[VELDSPAR, 5]]), reprocessing, NO_SKILLS, {
      34: 3,
    });

    expect(result.refineValue).toBe(400 * 3);
    expect(result.pricedAll).toBe(true);
  });

  it("refines at the pilot's facility yield and takes its tax off the refined value", () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 200 }];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [VELDSPAR, { portionSize: 100, materials: [{ typeId: 34, quantity: 400 }] }],
    ]);

    const result = valueMiningYield(
      lines,
      new Map([[VELDSPAR, 5]]),
      reprocessing,
      NO_SKILLS,
      { 34: 3 },
      { refining: { stationRate: 0.6, taxRate: 0.1 } }
    );

    expect(result.refineValue).toBeCloseTo(1440 * 0.9, 6);
    expect(result.efficiency).toBeCloseTo(0.6, 6);
  });

  it('marks the entry Partial when a line has no mined-date raw price', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 100 }];
    const result = valueMiningYield(lines, new Map(), new Map(), NO_SKILLS, {});
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

    const result = valueMiningYield(lines, new Map([[VELDSPAR, 5]]), reprocessing, NO_SKILLS, {});

    expect(result.pricedAll).toBe(false);
    expect(result.refineValue).toBe(0);
  });

  it('skips refine pricing and does not mark Partial for missing refine data when includeRefining is false (issue #1281)', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 200 }];
    const result = valueMiningYield(
      lines,
      new Map([[VELDSPAR, 5]]),
      new Map(),
      NO_SKILLS,
      {},
      {
        includeRefining: false,
      }
    );
    expect(result.refineValue).toBe(0);
    expect(result.lines[0].refineValue).toBe(0);
    expect(result.lines[0].refineOutputs).toEqual([]);
    expect(result.lines[0].batches).toBe(0);
    expect(result.pricedAll).toBe(true);
  });

  it('returns zero totals for an empty ore-line list', () => {
    const result = valueMiningYield([], new Map(), new Map(), NO_SKILLS, {});
    expect(result).toEqual({
      rawValue: 0,
      refineValue: 0,
      pricedAll: true,
      lines: [],
      efficiency: 0.5,
      implantBonusPct: 0,
    });
  });
});

describe('valueMiningYield line detail (issue: Mining Yield row detail)', () => {
  it('carries each line the materials it actually refines into', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 250 }];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [VELDSPAR, { portionSize: 100, materials: [{ typeId: 34, quantity: 400 }] }],
    ]);

    const result = valueMiningYield(lines, new Map([[VELDSPAR, 5]]), reprocessing, NO_SKILLS, {
      34: 3,
    });

    expect(result.lines[0].refineOutputs).toEqual([{ typeId: 34, quantity: 400 }]);
    expect(result.lines[0].batches).toBe(2);
    expect(result.lines[0].unitsLeftOver).toBe(50);
  });

  it('reports no outputs and the whole quantity left over below one portion', () => {
    const lines: OreLine[] = [{ typeId: VELDSPAR, quantity: 60 }];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [VELDSPAR, { portionSize: 100, materials: [{ typeId: 34, quantity: 400 }] }],
    ]);

    const result = valueMiningYield(lines, new Map([[VELDSPAR, 5]]), reprocessing, NO_SKILLS, {});

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
      {}
    );

    expect(result.lines[0].refineOutputs).toEqual([]);
    expect(result.lines[0].batches).toBe(0);
    expect(result.lines[0].unitsLeftOver).toBe(0);
  });

  it('reports the general-skills reprocessing efficiency the UI states, at the NPC station base rate', () => {
    const result = valueMiningYield([], new Map(), new Map(), NO_SKILLS, {});
    expect(result.efficiency).toBe(0.5);
  });

  it('folds the refining implant bonus into the reported efficiency and reports the pct (issue #1227)', () => {
    const result = valueMiningYield(
      [],
      new Map(),
      new Map(),
      characterModifiers({ skills: {}, implantTypeIds: [RX_804] }),
      {}
    );
    expect(result.efficiency).toBeCloseTo(0.5 * 1.04, 10);
    expect(result.implantBonusPct).toBe(4);
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
    const modifiers = characterModifiers({
      skills: { [SIMPLE_ORE_PROCESSING]: 5 },
      implantTypeIds: [],
    });

    const result = valueMiningYield(
      lines,
      new Map([
        [VELDSPAR, 5],
        [ICE, 5],
      ]),
      reprocessing,
      modifiers,
      { 34: 1 }
    );

    expect(result.lines[0].refineOutputs).toEqual([{ typeId: 34, quantity: 55 }]);
    expect(result.lines[1].refineOutputs).toEqual([{ typeId: 34, quantity: 50 }]);
  });

  it('falls back to Scrapmetal Processing for a type with no specialisation attribute', () => {
    const lines: OreLine[] = [{ typeId: UNREPROCESSABLE, quantity: 100 }];
    const reprocessing = new Map<number, YieldReprocessingEntry | undefined>([
      [UNREPROCESSABLE, { portionSize: 100, materials: [{ typeId: 34, quantity: 100 }] }],
    ]);
    const modifiers = characterModifiers({
      skills: { [SCRAPMETAL_PROCESSING]: 5 },
      implantTypeIds: [],
    });

    const result = valueMiningYield(
      lines,
      new Map([[UNREPROCESSABLE, 5]]),
      reprocessing,
      modifiers,
      { 34: 1 }
    );

    expect(result.lines[0].refineOutputs).toEqual([{ typeId: 34, quantity: 55 }]);
  });
});
