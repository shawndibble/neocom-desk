import { describe, expect, it } from 'vitest';
import { oreBreakdownSummary, sumUnits } from './oreBreakdown';
import type { OreLine } from '@/engine/miningTax/types';

describe('sumUnits', () => {
  it('sums every line quantity', () => {
    const lines: OreLine[] = [
      { typeId: 1, quantity: 100 },
      { typeId: 2, quantity: 50 },
    ];
    expect(sumUnits(lines)).toBe(150);
  });

  it('is zero for no lines', () => {
    expect(sumUnits([])).toBe(0);
  });
});

describe('oreBreakdownSummary', () => {
  it('returns an em dash for no lines', () => {
    expect(oreBreakdownSummary([], new Map())).toBe('—');
  });

  it('names the single line directly', () => {
    const lines: OreLine[] = [{ typeId: 1, quantity: 100 }];
    const typeNames = new Map([[1, 'Bitumens']]);
    expect(oreBreakdownSummary(lines, typeNames)).toBe('Bitumens');
  });

  it('names both lines when exactly two, joined by a comma', () => {
    const lines: OreLine[] = [
      { typeId: 1, quantity: 100 },
      { typeId: 2, quantity: 50 },
    ];
    const typeNames = new Map([
      [1, 'Bitumens'],
      [2, 'Zeolites'],
    ]);
    expect(oreBreakdownSummary(lines, typeNames)).toBe('Bitumens, Zeolites');
  });

  it('names the two largest by quantity and counts the rest (issue #1282)', () => {
    const lines: OreLine[] = [
      { typeId: 1, quantity: 100 },
      { typeId: 2, quantity: 300 },
      { typeId: 3, quantity: 50 },
      { typeId: 4, quantity: 20 },
    ];
    const typeNames = new Map([
      [1, 'Bitumens'],
      [2, 'Zeolites'],
      [3, 'Cobaltite'],
      [4, 'Euxenite'],
    ]);
    expect(oreBreakdownSummary(lines, typeNames)).toBe('Zeolites, Bitumens +2');
  });

  it('falls back to #typeId for a type with no known name', () => {
    const lines: OreLine[] = [{ typeId: 42, quantity: 10 }];
    expect(oreBreakdownSummary(lines, new Map())).toBe('#42');
  });
});
