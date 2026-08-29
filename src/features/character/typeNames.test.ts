import { describe, it, expect, vi } from 'vitest';
import type { TypeMap } from '@/sde/types';

const TYPES: TypeMap = {
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
};

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => TYPES),
}));

const { loadTypeName, loadTypeNames } = await import('./typeNames');

describe('loadTypeName', () => {
  it('returns the SDE name for a known typeID', async () => {
    expect(await loadTypeName(34)).toBe('Tritanium');
  });

  it('falls back to "Type #id" for an unknown typeID', async () => {
    expect(await loadTypeName(99999)).toBe('Type #99999');
  });
});

describe('loadTypeNames', () => {
  it('resolves a batch, mixing known and unknown ids', async () => {
    const names = await loadTypeNames([34, 99999]);
    expect(names.get(34)).toBe('Tritanium');
    expect(names.get(99999)).toBe('Type #99999');
  });
});
