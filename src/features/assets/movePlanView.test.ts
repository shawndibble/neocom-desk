import { describe, expect, it } from 'vitest';
import {
  PICKUP_HUE_COUNT,
  pickedTotals,
  pickupHues,
  shortStationLabels,
  splitSegments,
  sortStacksByVolume,
  tripLanes,
  tripRuns,
} from './movePlanView';
import type { PickerStack } from './movePlanInput';

const stack = (
  key: string,
  locationId: number,
  typeId: number,
  quantity: number,
  ship = false
): PickerStack => ({
  key,
  characterId: 1,
  locationId,
  locationType: 'station',
  typeId,
  quantity,
  ship,
});

describe('pickupHues', () => {
  it('numbers locations in first-seen order and wraps after the palette', () => {
    const ids = Array.from({ length: PICKUP_HUE_COUNT + 2 }, (_, i) => 100 + i);
    const hues = pickupHues([...ids, 100]);
    expect(hues.get(100)).toBe(0);
    expect(hues.get(101)).toBe(1);
    expect(hues.get(100 + PICKUP_HUE_COUNT)).toBe(0);
    expect(hues.size).toBe(ids.length);
  });
});

describe('splitSegments', () => {
  it('shares the total between parts and drops empty ones', () => {
    const out = splitSegments([
      { key: 1, m3: 75 },
      { key: 2, m3: 0 },
      { key: 3, m3: 25 },
    ]);
    expect(out).toEqual([
      { key: 1, m3: 75, share: 0.75 },
      { key: 3, m3: 25, share: 0.25 },
    ]);
  });
  it('is empty with nothing to share', () => {
    expect(splitSegments([{ key: 1, m3: 0 }])).toEqual([]);
  });
});

describe('tripLanes', () => {
  it('cuts the load into hold-sized trips with a short last one', () => {
    const lanes = tripLanes(23862, 6500);
    expect(lanes.map((l) => l.m3)).toEqual([6500, 6500, 6500, 4362]);
    expect(lanes.map((l) => l.trip)).toEqual([1, 2, 3, 4]);
    expect(lanes.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 10);
  });
  it('is one lane when it fits, and none without a load or a hold', () => {
    expect(tripLanes(100, 6500).map((l) => l.m3)).toEqual([100]);
    expect(tripLanes(0, 6500)).toEqual([]);
    expect(tripLanes(100, 0)).toEqual([]);
  });
});

describe('pickedTotals', () => {
  const stacks = [
    stack('a', 10, 34, 1000),
    stack('b', 10, 35, 500),
    stack('c', 20, 34, 200),
    stack('s', 20, 99, 1, true),
  ];
  const unit = new Map([
    [34, 0.01],
    [35, 0.5],
  ]);
  it('counts picked stacks and ships and sums known volume per location', () => {
    const t = pickedTotals(stacks, new Set(['a', 'c', 's']), unit, new Set());
    expect(t.stacks).toBe(2);
    expect(t.ships).toBe(1);
    expect(t.m3).toBeCloseTo(12);
    expect(t.byLocation.get(10)).toBeCloseTo(10);
    expect(t.byLocation.get(20)).toBeCloseTo(2);
  });
  it('ignores picks at a destination location', () => {
    const t = pickedTotals(stacks, new Set(['a', 'b', 'c']), unit, new Set([10]));
    expect(t.stacks).toBe(1);
    expect(t.m3).toBeCloseTo(2);
  });
  it('leaves a stack without a known volume out of the m3', () => {
    const t = pickedTotals([stack('x', 10, 77, 5)], new Set(['x']), unit, new Set());
    expect(t.stacks).toBe(1);
    expect(t.m3).toBe(0);
  });
});

describe('shortStationLabels', () => {
  it('keeps the part before the first dash and the full name where two would collide', () => {
    expect(
      shortStationLabels([
        'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
        'Amarr VIII (Oris) - Emperor Family Academy',
        'Hek VIII - Moon 12 - Boundless Creation Factory',
        'Hek VIII - Moon 4 - Krusual Tribe Bureau',
      ])
    ).toEqual([
      'Jita IV',
      'Amarr VIII (Oris)',
      'Hek VIII - Moon 12 - Boundless Creation Factory',
      'Hek VIII - Moon 4 - Krusual Tribe Bureau',
    ]);
  });
});

describe('sortStacksByVolume', () => {
  const unitM3 = new Map([
    [1, 0.01],
    [2, 1],
    [3, 1],
  ]);
  const names = new Map([
    [1, 'Tritanium'],
    [2, 'Mexallon'],
    [3, 'Pyerite'],
  ]);
  const name = (id: number) => names.get(id) ?? '';

  it('puts the biggest packaged volume first', () => {
    const out = sortStacksByVolume(
      [stack('a', 1, 2, 5), stack('b', 1, 1, 20000), stack('c', 1, 3, 100)],
      unitM3,
      name
    );
    expect(out.map((s) => s.key)).toEqual(['b', 'c', 'a']);
  });

  it('breaks equal volumes by item name and does not mutate the input', () => {
    const input = [stack('p', 1, 3, 10), stack('m', 1, 2, 10)];
    expect(sortStacksByVolume(input, unitM3, name).map((s) => s.key)).toEqual(['m', 'p']);
    expect(input.map((s) => s.key)).toEqual(['p', 'm']);
  });
});

describe('tripRuns', () => {
  it('folds neighbouring full trips into one range and keeps the short last trip apart', () => {
    expect(tripRuns(tripLanes(23862, 6500))).toEqual([
      { from: 1, to: 3, m3: 6500 },
      { from: 4, to: 4, m3: 4362 },
    ]);
  });
  it('is one single-trip run when it fits, and empty without lanes', () => {
    expect(tripRuns(tripLanes(100, 6500))).toEqual([{ from: 1, to: 1, m3: 100 }]);
    expect(tripRuns([])).toEqual([]);
  });
});
