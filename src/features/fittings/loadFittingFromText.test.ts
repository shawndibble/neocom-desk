import { describe, expect, it, vi } from 'vitest';

vi.mock('@/sde/loadSde', () => ({
  loadFittingSlots: async () => ({}),
  typeName: async (typeId: number) => `Type ${typeId}`,
}));
vi.mock('@/features/skills/typeCatalog', () => ({ loadItemNameMap: async () => new Map() }));

const { loadFittingFromText } = await import('./loadFittingFromText');

describe('loadFittingFromText', () => {
  it('reads a pasted Share Link as its own code, not as a Fitting to re-encode', async () => {
    const result = await loadFittingFromText('https://app.example/fittings?f=abc123');
    expect(result).toEqual({
      ok: true,
      fitting: null,
      unresolved: [],
      error: null,
      shareCode: 'abc123',
    });
  });

  it('reports unrecognised text with no share code', async () => {
    const result = await loadFittingFromText('not a fitting at all');
    expect(result.shareCode).toBeNull();
    expect(result.error).toBe('unrecognised');
  });
});
