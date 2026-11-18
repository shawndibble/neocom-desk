import { describe, expect, it } from 'vitest';
import type { ImproveOption } from './improve';
import { moveKey, optionKey, setKey, slotsOf, toggleTick, withHovered } from './improveKeys';

function option(toTypeId: number, slotIndex: number, pairedSlot?: number): ImproveOption {
  return {
    candidate: {
      fromTypeId: 1,
      toTypeId,
      at: [{ slot: 'low', slotIndex }],
      ...(pairedSlot === undefined
        ? {}
        : {
            pairedWith: {
              fromTypeId: 2,
              toTypeId: 3,
              at: [{ slot: 'mid', slotIndex: pairedSlot }],
            },
          }),
    },
    score: 0.1,
    iskDelta: 0,
  } as ImproveOption;
}

describe('improveKeys', () => {
  it('keys a move by its modules and slot, its pair included', () => {
    expect(moveKey(option(10, 2).candidate)).toBe('1-10-low2');
    expect(optionKey(option(10, 2, 1))).toBe('1-10-low2+2-3-mid1');
  });

  it('lists every slot a suggestion changes, its pair included', () => {
    expect(slotsOf(option(10, 2, 1).candidate)).toEqual(['low2', 'mid1']);
  });

  it('keys a set the same whatever its order', () => {
    const [a, b] = [option(10, 0), option(11, 1)];
    expect(setKey([a, b])).toBe(setKey([b, a]));
  });

  it('ticks a row, then unticks it', () => {
    const a = option(10, 0);
    const on = toggleTick(new Map(), new Map(), a, () => 'a');
    expect([...on.byModule.keys()]).toEqual([optionKey(a)]);
    expect(toggleTick(on.byModule, on.replaced, a, () => 'a').byModule.size).toBe(0);
  });

  it('displaces a ticked row sharing a slot and remembers its label', () => {
    const [a, b] = [option(10, 0), option(11, 0)];
    const on = toggleTick(new Map(), new Map(), a, () => 'swap a');
    const next = toggleTick(on.byModule, on.replaced, b, () => 'swap a');
    expect([...next.byModule.keys()]).toEqual([optionKey(b)]);
    expect(next.replaced.get(optionKey(b))).toBe('swap a');
  });

  it('puts the hovered row on top of the ticks it does not collide with', () => {
    const [a, b, hovered] = [option(10, 0), option(11, 1), option(12, 1)];
    expect(withHovered([a, b], hovered)).toEqual([a, hovered]);
  });
});
