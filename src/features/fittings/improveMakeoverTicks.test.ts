import { describe, expect, it } from 'vitest';
import type { ImproveOption } from '@/engine/fittings/improve';
import { optionKey, toggleTick } from '@/engine/fittings/improveKeys';
import {
  groupTick,
  groupToggleTarget,
  makeoverOptionsOf,
  showsOwnGain,
  singleGainsOf,
  tickMakeoverRows,
} from './improveMakeoverTicks';
import { MAKEOVER, MAKEOVER_KEYS, MAKEOVER_ROWS } from './improveMakeoverFixture';

const keys = ['a', 'b', 'c'];

describe('groupTick', () => {
  it('is all, some or none by how many rows are ticked', () => {
    expect(groupTick(keys, new Set(keys))).toBe('all');
    expect(groupTick(keys, new Set(['a', 'c']))).toBe('some');
    expect(groupTick(keys, new Set())).toBe('none');
  });
  it('ignores ticks that belong to other rows', () => {
    expect(groupTick(keys, new Set(['x']))).toBe('none');
  });
});

describe('groupToggleTarget', () => {
  it('ticks every row unless all are ticked already', () => {
    expect(groupToggleTarget('none')).toBe(true);
    expect(groupToggleTarget('some')).toBe(true);
    expect(groupToggleTarget('all')).toBe(false);
  });
});

describe('showsOwnGain', () => {
  it('shows only while the group is partly ticked', () => {
    expect(showsOwnGain('all')).toBe(false);
    expect(showsOwnGain('none')).toBe(false);
    expect(showsOwnGain('some')).toBe(true);
  });
});

const label = (option: ImproveOption) => `${option.candidate.fromTypeId}`;
const single = (fromTypeId: number, toTypeId: number, slotIndex: number, score = 0.1) =>
  ({
    candidate: { fromTypeId, toTypeId, at: [{ slot: 'low' as const, slotIndex }] },
    score,
    iskDelta: null,
    lost: [],
  }) as unknown as ImproveOption;

describe('makeoverOptionsOf', () => {
  it('makes one option per row, priced by the row and keyed like the row', () => {
    const options = makeoverOptionsOf({ ...MAKEOVER, iskDelta: null }, (typeId) => typeId * 10);
    expect(options.map(optionKey)).toEqual(MAKEOVER_KEYS);
    // a swap costs the new module minus the old, per copy
    expect(options[0].iskDelta).toBe((2048 - 1422) * 10);
    // a rig is destroyed on removal: the full new rig, for each of its three slots
    expect(options[3].iskDelta).toBe(31796 * 10 * 3);
  });
  it('leaves the price null when a type has none', () => {
    const options = makeoverOptionsOf(MAKEOVER, () => null);
    expect(options.every((o) => o.iskDelta === null)).toBe(true);
  });
});

describe('singleGainsOf', () => {
  it("takes a row's gain from the same swap scored alone, and leaves other rows out", () => {
    const [first, second] = MAKEOVER_ROWS;
    const gains = singleGainsOf(MAKEOVER_ROWS, [
      { ...single(1422, 2048, 0, 0.12), candidate: first },
      {
        ...single(1422, 22291, 1, 0.3),
        candidate: { ...second, at: [...second.at, { slot: 'low', slotIndex: 5 }] },
      },
    ]);
    expect(gains.get(MAKEOVER_KEYS[0])).toBe(0.12);
    // same type swap but over a different number of copies is a different swap
    expect(gains.has(MAKEOVER_KEYS[1])).toBe(false);
    expect(gains.size).toBe(1);
  });
});

describe('tickMakeoverRows', () => {
  const rows = makeoverOptionsOf(MAKEOVER, () => 1);
  const keysOf = (m: ReadonlyMap<string, ImproveOption>) => [...m.keys()];

  it('ticks every row, and unticks them all', () => {
    const on = tickMakeoverRows(new Map(), new Map(), rows, true, label);
    expect(keysOf(on.byModule)).toEqual(MAKEOVER_KEYS);
    const off = tickMakeoverRows(on.byModule, on.replaced, rows, false, label);
    expect(off.byModule.size).toBe(0);
  });

  it('ticks only the rows given', () => {
    const next = tickMakeoverRows(new Map(), new Map(), [rows[2]], true, label);
    expect(keysOf(next.byModule)).toEqual([MAKEOVER_KEYS[2]]);
  });

  it('unticks a single swap that shares a slot with a row being ticked, and says so', () => {
    const swap = single(1422, 31796, 0);
    const start = toggleTick(new Map(), new Map(), swap, label);
    const next = tickMakeoverRows(start.byModule, start.replaced, rows, true, label);
    expect(next.byModule.has(optionKey(swap))).toBe(false);
    expect(next.byModule.size).toBe(rows.length);
    expect(next.replaced.get(MAKEOVER_KEYS[0])).toBe('1422');
  });

  it('keeps a single swap on another slot', () => {
    const swap = single(777, 778, 9);
    const start = toggleTick(new Map(), new Map(), swap, label);
    const next = tickMakeoverRows(start.byModule, start.replaced, rows, true, label);
    expect(next.byModule.has(optionKey(swap))).toBe(true);
  });

  it('is undone the other way: ticking the single swap unticks the Makeover row on its slot', () => {
    const start = tickMakeoverRows(new Map(), new Map(), rows, true, label);
    const swap = single(1422, 31796, 0);
    const next = toggleTick(start.byModule, start.replaced, swap, label);
    expect(next.byModule.has(MAKEOVER_KEYS[0])).toBe(false);
    expect(next.byModule.has(optionKey(swap))).toBe(true);
    expect(next.byModule.size).toBe(rows.length);
  });
});
