/**
 * Moon names for the Corp Tax Book (issue #4194): `GET /universe/moons/{id}`
 * is public and a moon's name never changes, so each is read once through the
 * same static-entity cache as stations and systems, and one that ESI cannot
 * name is left out (the caller prints a fallback) rather than failing the page.
 */
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
