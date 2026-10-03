import { describe, expect, it } from 'vitest';
import type { LoadParts, LoadWarning } from './load';
import type { FittingModule, FittingSlotKind } from './types';
import {
  classifyFitCurrency,
  partitionByCurrency,
  type FitCurrency,
  type HullSlotCounts,
} from './fitCurrency';

const VEXOR: HullSlotCounts = { high: 4, medium: 4, low: 5, rig: 3 };

function modules(rack: FittingSlotKind, count: number, typeId = 100): FittingModule[] {
  return Array.from({ length: count }, (_, slotIndex) => ({
    slot: rack,
    slotIndex,
    typeId,
    state: 'active' as const,
  }));
}

function parts(fitted: FittingModule[], unresolved: LoadWarning[] = []): LoadParts {
  return { hullTypeId: 626, modules: fitted, drones: [], cargo: [], unresolved };
}

describe('classifyFitCurrency', () => {
  it('a fit that loads clean and fits the hull is current', () => {
    const fit = parts([...modules('high', 4), ...modules('medium', 4), ...modules('low', 5)]);
    expect(classifyFitCurrency(fit, VEXOR)).toEqual({ current: true });
  });

  it('a fit naming an item the game data no longer has is out of date, naming it', () => {
    const fit = parts(modules('high', 2), [
      { text: 'Old Gun I', reason: 'unknown item' },
      { text: 'Old Ammo', reason: 'unknown item' },
    ]);
    expect(classifyFitCurrency(fit, VEXOR)).toEqual({
      current: false,
      reasons: [
        { kind: 'removed-item', name: 'Old Gun I' },
        { kind: 'removed-item', name: 'Old Ammo' },
      ],
    });
  });

  it('names a removed item once however many times the fit uses it', () => {
    const fit = parts(
      [],
      [
        { text: 'Old Gun I', reason: 'unknown item' },
        { text: 'Old Gun I', reason: 'unknown item' },
      ]
    );
    expect(classifyFitCurrency(fit, VEXOR)).toEqual({
      current: false,
      reasons: [{ kind: 'removed-item', name: 'Old Gun I' }],
    });
  });

  it('a hull the game data no longer has is out of date', () => {
    const fit: LoadParts = {
      hullTypeId: null,
      unresolved: [{ text: 'Old Hull', reason: 'unknown ship' }],
    };
    expect(classifyFitCurrency(fit, null)).toEqual({
      current: false,
      reasons: [{ kind: 'unknown-hull', name: 'Old Hull' }],
    });
  });

  it('more modules in a rack than the hull has slots is out of date, naming the rack', () => {
    const fit = parts([...modules('high', 5), ...modules('rig', 4), ...modules('low', 5)]);
    expect(classifyFitCurrency(fit, VEXOR)).toEqual({
      current: false,
      reasons: [
        { kind: 'lost-slots', rack: 'high' },
        { kind: 'lost-slots', rack: 'rig' },
      ],
    });
  });

  it("the loader's own too-many-slots warning is a lost-slots reason too, once per rack", () => {
    const fit = parts(modules('medium', 4), [
      { text: 'Warp Scrambler II', reason: 'too many medium slots' },
      { text: 'Warp Disruptor II', reason: 'too many medium slots' },
    ]);
    expect(classifyFitCurrency(fit, VEXOR)).toEqual({
      current: false,
      reasons: [{ kind: 'lost-slots', rack: 'medium' }],
    });
  });

  it('lists every reason: removed items first, then racks', () => {
    const fit = parts(modules('high', 6), [{ text: 'Old Gun I', reason: 'unknown item' }]);
    expect(classifyFitCurrency(fit, VEXOR)).toEqual({
      current: false,
      reasons: [
        { kind: 'removed-item', name: 'Old Gun I' },
        { kind: 'lost-slots', rack: 'high' },
      ],
    });
  });

  it('never reads CPU, powergrid or calibration: an overloaded fit that fits its racks is current', () => {
    // Ten Large Shield Extenders' worth of powergrid in four mid slots is still
    // four modules in four slots — skills and implants decide the budget.
    const fit = parts(modules('medium', 4, 3841));
    expect(classifyFitCurrency(fit, VEXOR)).toEqual({ current: true });
  });

  it('badly written text is not out of date: the game did not change', () => {
    const fit = parts(modules('high', 1), [
      { line: 3, text: '%%%', reason: 'unparseable item line' },
    ]);
    expect(classifyFitCurrency(fit, VEXOR)).toEqual({ current: true });

    // A missing header leaves no hull name to call removed.
    const headerless: LoadParts = {
      hullTypeId: null,
      unresolved: [
        { text: 'Gun', reason: 'invalid or missing fit header' },
        { text: '', reason: 'unknown ship' },
      ],
    };
    expect(classifyFitCurrency(headerless, null)).toEqual({ current: true });
  });

  it('without the hull’s slot counts, racks are not counted', () => {
    expect(classifyFitCurrency(parts(modules('high', 8)), null)).toEqual({ current: true });
  });

  it('a Tech 3 cruiser’s high, mid and low racks are not counted: its subsystems set them', () => {
    const t3: HullSlotCounts = { high: 0, medium: 0, low: 0, rig: 3 };
    const fit = parts([
      ...modules('subsystem', 4),
      ...modules('high', 6),
      ...modules('medium', 5),
      ...modules('low', 4),
      ...modules('rig', 3),
    ]);
    expect(classifyFitCurrency(fit, t3)).toEqual({ current: true });
    // Its rigs still are.
    expect(classifyFitCurrency(parts([...modules('high', 6), ...modules('rig', 4)]), t3)).toEqual({
      current: false,
      reasons: [{ kind: 'lost-slots', rack: 'rig' }],
    });
  });
});

describe('partitionByCurrency', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const c = { id: 'c' };
  const outOfDate: FitCurrency = {
    current: false,
    reasons: [{ kind: 'removed-item', name: 'Old Gun I' }],
  };

  it('splits fits into current and out of date, keeping each side in order', () => {
    const verdicts = new Map<string, FitCurrency>([
      ['a', outOfDate],
      ['b', { current: true }],
      ['c', { current: true }],
    ]);
    expect(partitionByCurrency([a, b, c], verdicts)).toEqual({
      current: [b, c],
      outOfDate: [{ fit: a, reasons: outOfDate.reasons }],
    });
  });

  it('a fit without a verdict counts as current', () => {
    expect(partitionByCurrency([a, b], new Map([['b', outOfDate]]))).toEqual({
      current: [a],
      outOfDate: [{ fit: b, reasons: outOfDate.reasons }],
    });
  });
});
