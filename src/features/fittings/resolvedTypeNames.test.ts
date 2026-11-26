import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogueTypeName } from './useFittingCatalogue';
import { resetResolvedTypeNames, resolvedTypeNames, resolveTypeNames } from './resolvedTypeNames';

const loadTypeNames = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames }));

describe('resolveTypeNames', () => {
  beforeEach(() => {
    resetResolvedTypeNames();
    loadTypeNames.mockReset();
    loadTypeNames.mockResolvedValue(new Map([[63810, 'AIR Agility Booster II']]));
  });

  it('names an item the catalogue lacks once ESI answers, and looks it up once', async () => {
    expect(catalogueTypeName(null, 63810)).toBe('#63810');
    const before = resolvedTypeNames();
    resolveTypeNames([63810]);
    resolveTypeNames([63810]);
    await vi.waitFor(() => expect(resolvedTypeNames()).not.toBe(before));
    expect(catalogueTypeName(null, 63810)).toBe('AIR Agility Booster II');
    expect(loadTypeNames).toHaveBeenCalledTimes(1);
  });

  it('keeps #id for an item nothing can name', async () => {
    loadTypeNames.mockResolvedValue(new Map([[7, 'Type #7']]));
    resolveTypeNames([7]);
    await loadTypeNames.mock.results[0]?.value;
    await vi.waitFor(() => expect(loadTypeNames).toHaveBeenCalled());
    await loadTypeNames.mock.results[0].value;
    expect(catalogueTypeName(null, 7)).toBe('#7');
  });
});
