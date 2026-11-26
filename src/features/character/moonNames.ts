import { loadStaticEntity } from '@/esi/cache';
import { getUniverseMoon } from '@/esi/endpoints';

export async function loadMoonNames(moonIds: readonly number[]): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  await Promise.all(
    [...new Set(moonIds)].map(async (id) => {
      const moon = await loadStaticEntity('moon', id, getUniverseMoon).catch(() => null);
      if (moon?.data.name) names.set(id, moon.data.name);
    })
  );
  return names;
}
