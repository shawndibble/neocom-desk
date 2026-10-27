import { describe, it, expect } from 'vitest';
import { rowVolume, totalVolume } from './materialVolume';

const VOLUMES: Record<number, number> = { 34: 0.01, 587: 27289 };
const volumeFor = (typeID: number): number | null => VOLUMES[typeID] ?? null;

describe('rowVolume', () => {
  it('multiplies quantity by the resolved per-unit volume', () => {
    expect(rowVolume({ typeID: 34, quantity: 1000 }, volumeFor)).toBe(10);
  });

  it('returns null when the type has no resolvable volume', () => {
    expect(rowVolume({ typeID: 99999, quantity: 5 }, volumeFor)).toBeNull();
  });

  it('is zero for a zero-quantity row, not null', () => {
    expect(rowVolume({ typeID: 34, quantity: 0 }, volumeFor)).toBe(0);
  });
});

describe('totalVolume', () => {
  it('sums known rows', () => {
    const result = totalVolume(
      [
        { typeID: 34, quantity: 1000 },
        { typeID: 587, quantity: 1 },
      ],
      volumeFor
    );
    expect(result).toEqual({ volume: 27299, anyUnknown: false });
  });

  it('excludes an unresolvable row from the sum instead of treating it as zero, and flags it', () => {
    const result = totalVolume(
      [
        { typeID: 34, quantity: 1000 },
        { typeID: 99999, quantity: 5 },
      ],
      volumeFor
    );
    expect(result).toEqual({ volume: 10, anyUnknown: true });
  });

  it('never returns NaN even when every row is unresolvable', () => {
    const result = totalVolume([{ typeID: 99999, quantity: 5 }], volumeFor);
    expect(result).toEqual({ volume: 0, anyUnknown: true });
  });

  it('is zero and not unknown for an empty list', () => {
    expect(totalVolume([], volumeFor)).toEqual({ volume: 0, anyUnknown: false });
  });
});
