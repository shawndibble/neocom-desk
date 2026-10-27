import { describe, expect, it } from 'vitest';
import { sumVolume, volumeDisplayMode } from './volume';

interface Line {
  typeId: number;
  quantity: number;
}

describe('sumVolume', () => {
  it('sums every line when all types have a known volume', () => {
    const lines: Line[] = [
      { typeId: 1, quantity: 100 },
      { typeId: 2, quantity: 50 },
    ];
    const typeVolumes = new Map([
      [1, 0.1],
      [2, 0.2],
    ]);

    const result = sumVolume(
      lines,
      (l) => l.typeId,
      (l) => l.quantity,
      typeVolumes
    );

    expect(result).toEqual({ m3: 100 * 0.1 + 50 * 0.2, missingTypeIds: [] });
  });

  it('returns the partial sum plus the missing typeIds, rather than dropping the whole total (issue #1283)', () => {
    const lines: Line[] = [
      { typeId: 1, quantity: 100 },
      { typeId: 2, quantity: 50 },
    ];
    const typeVolumes = new Map([[1, 0.1]]);

    const result = sumVolume(
      lines,
      (l) => l.typeId,
      (l) => l.quantity,
      typeVolumes
    );

    expect(result).toEqual({ m3: 10, missingTypeIds: [2] });
  });

  it('reports every typeId as missing and a zero sum when nothing is known', () => {
    const lines: Line[] = [{ typeId: 1, quantity: 100 }];

    const result = sumVolume(
      lines,
      (l) => l.typeId,
      (l) => l.quantity,
      new Map()
    );

    expect(result).toEqual({ m3: 0, missingTypeIds: [1] });
  });
});

describe('volumeDisplayMode', () => {
  it('is "complete" when nothing is missing', () => {
    expect(volumeDisplayMode({ m3: 10, missingTypeIds: [] })).toEqual({ kind: 'complete' });
  });

  it('is "partial" when some volume is known and some is missing — never a bare dash (issue #1283)', () => {
    expect(volumeDisplayMode({ m3: 10, missingTypeIds: [2] })).toEqual({ kind: 'partial' });
  });

  it('is "unknown" only when nothing at all is known', () => {
    expect(volumeDisplayMode({ m3: 0, missingTypeIds: [1] })).toEqual({ kind: 'unknown' });
  });
});
