import { loadUniverseType } from '@/features/skills/data';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import {
  useNotificationPreferences,
  hydrateNotificationPreferences,
  characterEventThresholds,
  characterEveTypePrefs,
} from '../preferences';

export async function currentThresholds(characterId: number) {
  await hydrateNotificationPreferences();
  return characterEventThresholds(useNotificationPreferences.getState().value, characterId);
}

export async function currentEveTypePrefs(characterId: number) {
  await hydrateNotificationPreferences();
  return characterEveTypePrefs(useNotificationPreferences.getState().value, characterId);
}

export async function resolveProjectionNames(
  ids: readonly number[],
  loadName: (id: number) => Promise<string | null>
): Promise<ReadonlyMap<number, string>> {
  const uniqueIds = [...new Set(ids)];
  const names = new Map<number, string>();
  await mapWithConcurrencyLimit(uniqueIds, ESI_FANOUT_CONCURRENCY, async (id) => {
    const name = await loadName(id);
    if (name !== null) names.set(id, name);
  });
  return names;
}

export async function universeTypeName(typeId: number): Promise<string | null> {
  const result = await loadUniverseType(typeId);
  return result?.data.name ?? null;
}

export async function typeNameOrAbsent(typeId: number): Promise<string | undefined> {
  return (await universeTypeName(typeId)) ?? undefined;
}

export function optionalDateMs(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
}

export { DAY_MS, HOUR_MS } from '@/lib/age';
