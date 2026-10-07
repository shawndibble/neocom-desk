import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ReprocessingMap } from './types';

const readData = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url), 'utf8')) as T;

describe('compressed ore reprocessing data', () => {
  it('each compressed ore refines into the same portion and materials as its raw ore', () => {
    const reprocessing = readData<ReprocessingMap>('reprocessing.json');
    const compressedByRaw = readData<Record<string, number>>('compressedOreTypeIds.json');

    let compared = 0;
    const mismatches: string[] = [];
    for (const [rawId, compressedId] of Object.entries(compressedByRaw)) {
      const raw = reprocessing[rawId];
      const compressed = reprocessing[String(compressedId)];
      if (!raw || !compressed) continue;
      compared += 1;
      if (
        raw.portionSize !== compressed.portionSize ||
        JSON.stringify(raw.materials) !== JSON.stringify(compressed.materials)
      ) {
        mismatches.push(`${rawId} -> ${compressedId}`);
      }
    }

    expect(mismatches).toEqual([]);
    expect(compared).toBeGreaterThanOrEqual(180);
  });
});
