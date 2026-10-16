import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TYPE_INFO_SHARD_COUNT, typeInfoBucket, type TypeInfoShard } from './typeInfoShard';

// Drift guard: the committed shards (scripts/lib/typeInfo.mjs) are keyed the
// way the app looks them up (`typeInfoBucket`).
const dir = join(process.cwd(), 'public', 'data', 'typeInfo');
const read = (n: number) =>
  JSON.parse(readFileSync(join(dir, `${n}.json`), 'utf-8')) as TypeInfoShard;

describe('committed typeInfo shards', () => {
  it('are exactly TYPE_INFO_SHARD_COUNT files, 0..count-1', () => {
    const expected = Array.from({ length: TYPE_INFO_SHARD_COUNT }, (_, n) => `${n}.json`);
    expect(readdirSync(dir).sort()).toEqual(expected.sort());
  });

  it('hold each type in the range bucket typeInfoBucket names (floor(id / width))', () => {
    for (let n = 0; n < TYPE_INFO_SHARD_COUNT; n++) {
      const misplaced = Object.keys(read(n)).filter((k) => typeInfoBucket(Number(k)) !== n);
      expect(misplaced, `typeInfo/${n}.json`).toEqual([]);
    }
  });

  it('give every record an effects list, so a missing one never reads as "no hardpoint"', () => {
    for (let n = 0; n < TYPE_INFO_SHARD_COUNT; n++) {
      const bad = Object.entries(read(n))
        .filter(([, record]) => !Array.isArray(record.effects))
        .map(([id]) => id);
      expect(bad, `typeInfo/${n}.json`).toEqual([]);
    }
  });

  it('carry the Merlin (603) at its packaged volume', () => {
    expect(read(typeInfoBucket(603) ?? -1)['603'].packagedVolume).toBe(2500);
  });

  it('carry the Rifter (587) with its description and mass', () => {
    const rifter = read(typeInfoBucket(587) ?? -1)['587'];
    expect(rifter.description).not.toBe('');
    expect(rifter.attributes.some(([id]) => id === 4)).toBe(true);
  });
});
