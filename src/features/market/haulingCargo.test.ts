import { describe, expect, it } from 'vitest';
import { parseCargo, totalCargoM3 } from './haulingCargo';

describe('parseCargo', () => {
  it('reads a value saved before holds as one Any item hold', () => {
    expect(parseCargo({ label: 'Custom', m3: 12_400 })).toEqual({
      label: 'Custom',
      holds: [{ kind: 'general', capacityM3: 12_400 }],
    });
  });

  it('reads a set of holds, dropping any it does not recognise', () => {
    expect(
      parseCargo({
        label: 'Hoarder',
        holds: [
          { kind: 'general', capacityM3: 300 },
          { kind: 'ammo', capacityM3: 41_000 },
          { kind: 'corpse', capacityM3: 10 },
          { kind: 'gas', capacityM3: 0 },
        ],
      })
    ).toEqual({
      label: 'Hoarder',
      holds: [
        { kind: 'general', capacityM3: 300 },
        { kind: 'ammo', capacityM3: 41_000 },
      ],
    });
  });

  it('rejects a value with no usable hold', () => {
    expect(parseCargo({ label: 'Custom', m3: 0 })).toBeNull();
    expect(parseCargo({ label: 'Custom', holds: [] })).toBeNull();
    expect(parseCargo(null)).toBeNull();
  });
});

describe('totalCargoM3', () => {
  it('adds up every hold', () => {
    expect(
      totalCargoM3({
        label: 'Hoarder',
        holds: [
          { kind: 'general', capacityM3: 300 },
          { kind: 'ammo', capacityM3: 41_000 },
        ],
      })
    ).toBe(41_300);
  });
});
