/**
 * What more than one polled domain reads: the clock constants its baked-in
 * thresholds are scaled by, the per-poll preference reads, and the name
 * lookups its Projection and copy need.
 */
import { loadUniverseType } from '@/features/skills/data';
import { mapWithConcurrencyLimit, ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import {
  useNotificationPreferences,
  hydrateNotificationPreferences,
  characterEventThresholds,
  characterEveTypePrefs,
} from '../preferences';

/** This Character's current threshold settings (issue #299, synced since #363), re-read every poll — the mechanism AC4's "without a reload" relies on. */
export async function currentThresholds(characterId: number) {
  await hydrateNotificationPreferences();
  return characterEventThresholds(useNotificationPreferences.getState().value, characterId);
}

/** This Character's current per-EVE-notification-type settings, re-read every poll for the same reason as `currentThresholds`. */
export async function currentEveTypePrefs(characterId: number) {
  await hydrateNotificationPreferences();
  return characterEveTypePrefs(useNotificationPreferences.getState().value, characterId);
}

/**
 * Resolves a batch of type/planet ids to display names for a Projection row
 * (issue #355) — the impure boundary the pure `engine/projection.ts` module
 * deliberately stays on the far side of. Ids that fail to resolve are simply
 * absent from the map; each `project*` caller already falls back to `#id`.
 */
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

/** `universeTypeName` as a copy lookup: absent rather than null when unresolved. */
export async function typeNameOrAbsent(typeId: number): Promise<string | undefined> {
  return (await universeTypeName(typeId)) ?? undefined;
}

/** An ESI date string as epoch ms, or `undefined` when absent or unparseable. */
export function optionalDateMs(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : undefined;
}

export { DAY_MS, HOUR_MS } from '@/lib/age';
