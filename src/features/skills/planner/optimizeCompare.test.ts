import { describe, expect, it } from 'vitest';
import type { RemapSegment } from '@/engine/optimizer';
import type { PlanStep } from '@/engine/types';
import { compareOrders, optimizeForMeHasGain } from './optimizeCompare';

const step = (skillTypeID: number, level = 5): PlanStep => ({ skillTypeID, level });
const attributes = { intelligence: 27, memory: 21, perception: 17, willpower: 17, charisma: 17 };
const segment = (startIndex: number, remap: boolean): RemapSegment => ({
  startIndex,
  endIndex: startIndex,
  attributes,
  seconds: 0,
  remap,
});

describe('compareOrders', () => {
  it('numbers both lists and marks nothing moved when the order is unchanged', () => {
    const order = [step(1), step(2)];
    const { current, proposed } = compareOrders(order, order, [segment(0, false)]);
    expect(current.map((r) => r.movesTo)).toEqual([null, null]);
    expect(proposed).toEqual([
      { kind: 'step', step: order[0], position: 1, from: null },
      { kind: 'step', step: order[1], position: 2, from: null },
    ]);
  });

  it('reports where a moved step goes and where it came from', () => {
    const current = [step(1), step(2), step(3)];
    const proposed = [step(3), step(1), step(2)];
    const result = compareOrders(current, proposed, []);
    expect(result.current.map((r) => r.movesTo)).toEqual([2, 3, 1]);
    expect(result.proposed.map((r) => (r.kind === 'step' ? r.from : 'remap'))).toEqual([3, 1, 2]);
  });

  it('puts a remap marker before the step its segment starts at', () => {
    const order = [step(1), step(2), step(3)];
    const rows = compareOrders(order, order, [segment(0, false), segment(2, true)]).proposed;
    expect(rows.map((r) => r.kind)).toEqual(['step', 'step', 'remap', 'step']);
    expect(rows[2]).toMatchObject({ kind: 'remap', before: order[2] });
  });

  it('ignores the leading current-attributes segment', () => {
    const order = [step(1)];
    expect(compareOrders(order, order, [segment(0, false)]).proposed).toHaveLength(1);
  });

  it('treats a step missing from the current plan as not moved', () => {
    const { proposed } = compareOrders([step(1)], [step(1), step(9)], []);
    expect(proposed[1]).toMatchObject({ kind: 'step', from: null });
  });
});

describe('optimizeForMeHasGain', () => {
  const none = { savedSeconds: 0, markers: 0, prioritized: false };

  it('has no gain when no time is saved and no marker is added', () => {
    expect(optimizeForMeHasGain(none)).toBe(false);
    expect(optimizeForMeHasGain({ ...none, savedSeconds: 59 })).toBe(false);
  });

  it('has gain from a meaningful saving', () => {
    expect(optimizeForMeHasGain({ ...none, savedSeconds: 60 })).toBe(true);
  });

  it('has gain from a placed remap marker', () => {
    expect(optimizeForMeHasGain({ ...none, markers: 1 })).toBe(true);
  });

  it('keeps the preview when the pilot set priorities: the reorder is the point', () => {
    expect(optimizeForMeHasGain({ ...none, prioritized: true })).toBe(true);
  });
});
