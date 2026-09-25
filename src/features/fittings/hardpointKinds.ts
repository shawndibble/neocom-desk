/**
 * Which hardpoint a type takes, from its dogma effects on ESI — the same
 * cached `/universe/types/{id}` lookup the skill requirements read, so a
 * fitted type is fetched once for both.
 */
import { loadUniverseType } from '@/features/skills/data';

/** The game's `launcherFitted` and `turretFitted` effects. */
const LAUNCHER_FITTED = 40;
const TURRET_FITTED = 42;

const kindCache = new Map<number, 'turret' | 'launcher' | null>();

/** Null for a type that takes no hardpoint, and for one ESI couldn't supply. */
export async function loadHardpointKind(typeId: number): Promise<'turret' | 'launcher' | null> {
  const cached = kindCache.get(typeId);
  if (cached !== undefined) return cached;
  const result = await loadUniverseType(typeId);
  // Left uncached when unfetchable, like the requirements, so a retry can find it.
  if (!result) return null;
  const effects = new Set((result.data.dogma_effects ?? []).map((effect) => effect.effect_id));
  const kind = effects.has(TURRET_FITTED)
    ? 'turret'
    : effects.has(LAUNCHER_FITTED)
      ? 'launcher'
      : null;
  kindCache.set(typeId, kind);
  return kind;
}
