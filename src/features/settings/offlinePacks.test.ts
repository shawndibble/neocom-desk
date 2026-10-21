import { describe, expect, it } from 'vitest';
import { LAZY_SDE_FILES } from '@/sde/lazySdeFiles';
import { TYPE_INFO_SHARD_COUNT } from '@/sde/typeInfoShard';
import { setDecimalMark } from '@/lib/numberLocale';
import { OFFLINE_PACK_IDS, formatBytes, packFor, summarizePacks } from './offlinePacks';

describe('packFor', () => {
  it('files the type-info shards under one pack', () => {
    expect(packFor('typeInfo/0.json')).toBe('itemInfo');
    expect(packFor(`typeInfo/${TYPE_INFO_SHARD_COUNT - 1}.json`)).toBe('itemInfo');
  });

  it('gives every lazy SDE file a pack, so a new file is never silently unlisted', () => {
    for (const file of LAZY_SDE_FILES) {
      expect(OFFLINE_PACK_IDS).toContain(packFor(file));
    }
  });

  it('falls back to reference data for an unknown file', () => {
    expect(packFor('something-new.json')).toBe('reference');
  });
});

describe('summarizePacks', () => {
  it('groups files into packs with a downloaded count each', () => {
    const files = ['typeInfo/0.json', 'typeInfo/1.json', 'typeInfo/2.json', 'market/types.json'];
    const packs = summarizePacks(files, new Set(['typeInfo/0.json', 'typeInfo/2.json']));
    expect(packs).toEqual([
      { id: 'itemInfo', total: 3, cached: 2, state: 'partial' },
      { id: 'market', total: 1, cached: 0, state: 'missing' },
    ]);
  });

  it('marks a pack complete when every file is cached', () => {
    const packs = summarizePacks(['typeNames.json'], new Set(['typeNames.json']));
    expect(packs).toEqual([{ id: 'reference', total: 1, cached: 1, state: 'complete' }]);
  });

  it('omits packs with no files and keeps a fixed order', () => {
    const packs = summarizePacks(['pi-planet-radius.json', 'typeInfo/0.json'], new Set());
    expect(packs.map((pack) => pack.id)).toEqual(['itemInfo', 'planetary']);
  });

  it('counts the whole real list', () => {
    const packs = summarizePacks(LAZY_SDE_FILES, new Set());
    expect(packs.reduce((sum, pack) => sum + pack.total, 0)).toBe(LAZY_SDE_FILES.length);
    expect(packs.find((pack) => pack.id === 'itemInfo')?.total).toBe(TYPE_INFO_SHARD_COUNT);
  });
});

describe('formatBytes', () => {
  it('uses the largest sensible unit', () => {
    expect(formatBytes(0)).toBe('0 byte');
    expect(formatBytes(2048)).toBe('2 kB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(3.5 * 1024 ** 3)).toBe('3.5 GB');
  });

  it('follows the Number format decimal mark', () => {
    setDecimalMark(',');
    try {
      expect(formatBytes(3.5 * 1024 ** 3)).toBe('3,5 GB');
      expect(formatBytes(1023 * 1024)).toBe('1.023 kB');
    } finally {
      setDecimalMark('.');
    }
  });
});
