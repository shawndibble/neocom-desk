import { getUniverseRegion } from '@/esi/endpoints';
import { loadStaticEntity } from '@/esi/cache';

export async function loadRegionName(regionId: number): Promise<string | null> {
  const result = await loadStaticEntity('bpc-region', regionId, getUniverseRegion);
  return result?.data?.name ?? null;
}
