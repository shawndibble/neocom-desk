/**
 * Which hardpoint a type takes, from its dogma effects on cached ESI: the baked
 * shards carry no effects, so a type never fetched online has no offline read.
 */
import type { HardpointKind } from '@/engine/fittings/hardpoints';
import { loadUniverseType } from '@/features/skills/data';

/** The game's `launcherFitted` and `turretFitted` effects. */
const LAUNCHER_FITTED = 40;
const TURRET_FITTED = 42;

const kindCache = new Map<number, HardpointKind | null>();

/** Null for a type that takes no hardpoint; undefined for one ESI couldn't supply. */
export async function loadHardpointKind(typeId: number): Promise<HardpointKind | null | undefined> {
  const cached = kindCache.get(typeId);
  if (cached !== undefined) return cached;
  const result = await loadUniverseType(typeId);
  // Left uncached when unfetchable, like the requirements, so a retry can find it.
  if (!result) return undefined;
  const effects = new Set((result.data.dogma_effects ?? []).map((effect) => effect.effect_id));
  const kind = effects.has(TURRET_FITTED)
    ? 'turret'
    : effects.has(LAUNCHER_FITTED)
      ? 'launcher'
      : null;
  kindCache.set(typeId, kind);
  return kind;
}
