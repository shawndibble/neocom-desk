import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ReprocessingMap } from './types';

const readData = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../public/data/${name}`, import.meta.url), 'utf8')) as T;

describe('compressed gas data', () => {
  const compressedByRaw = readData<Record<string, number>>('compressedGasTypeIds.json');
  const types = readData<Record<string, { name: string; volume?: number }>>('types.json');

  it('maps every raw gas type to its published Compressed twin', () => {
    const gasIds = readData<number[]>('gasCloudTypeIds.json');
    const rawIds = gasIds.filter((id) => !types[id]?.name.startsWith('Compressed '));
    expect(rawIds).toHaveLength(25);
    for (const rawId of rawIds) {
      const compressedId = compressedByRaw[rawId];
      expect(compressedId, `no compressed twin for ${rawId}`).toBeDefined();
      expect(types[compressedId!]?.name).toBe(`Compressed ${types[rawId]?.name}`);
    }
  });

  it('each compressed gas decompresses 1:1 into its raw gas', () => {
    const reprocessing = readData<ReprocessingMap>('reprocessing.json');
    for (const [rawId, compressedId] of Object.entries(compressedByRaw)) {
      const entry = reprocessing[String(compressedId)];
      expect(entry?.portionSize).toBe(1);
      expect(entry?.materials).toEqual([{ typeID: Number(rawId), quantity: 1 }]);
    }
  });
});
