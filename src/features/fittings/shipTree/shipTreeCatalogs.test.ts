import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import {
  clearShipTreeCatalogCache,
  shipTreeBlueprintCatalog,
  shipTreeSkillCatalog,
} from './shipTreeCatalogs';

const catalog = {} as BlueprintCatalog;
vi.mock('@/features/industry/blueprintCatalog', () => ({
  loadBlueprintCatalog: vi.fn(async () => catalog),
}));
vi.mock('@/features/skills/skillMap', () => ({ loadSkillCatalog: vi.fn(async () => ({})) }));

beforeEach(() => {
  clearShipTreeCatalogCache();
  vi.mocked(loadBlueprintCatalog).mockClear();
});

describe('shipTreeCatalogs', () => {
  it('builds each catalog once and hands every caller the same one', async () => {
    const [a, b] = await Promise.all([shipTreeBlueprintCatalog(), shipTreeBlueprintCatalog()]);
    expect(await shipTreeBlueprintCatalog()).toBe(a);
    expect(b).toBe(catalog);
    expect(loadBlueprintCatalog).toHaveBeenCalledTimes(1);
    expect(await shipTreeSkillCatalog()).toBe(await shipTreeSkillCatalog());
  });

  it('retries after a failed load', async () => {
    vi.mocked(loadBlueprintCatalog).mockRejectedValueOnce(new Error('offline'));
    await expect(shipTreeBlueprintCatalog()).rejects.toThrow('offline');
    expect(await shipTreeBlueprintCatalog()).toBe(catalog);
    expect(loadBlueprintCatalog).toHaveBeenCalledTimes(2);
  });
});
