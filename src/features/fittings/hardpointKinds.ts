/** Which hardpoint a type takes, from its dogma effects. */
import type { HardpointKind } from '@/engine/fittings/hardpoints';
import { loadTypeDetail } from '@/features/skills/typeDetail';

/** The game's `launcherFitted` and `turretFitted` effects. */
const LAUNCHER_FITTED = 40;
const TURRET_FITTED = 42;

const kindCache = new Map<number, HardpointKind | null>();

/** Null for a type that takes no hardpoint; undefined for one no source could supply. */
export async function loadHardpointKind(typeId: number): Promise<HardpointKind | null | undefined> {
  const cached = kindCache.get(typeId);
  if (cached !== undefined) return cached;
  const type = await loadTypeDetail(typeId, { retry: true });
  // Left uncached when unfetchable, like the requirements, so a retry can find it.
  if (!type) return undefined;
  const effects = new Set((type.dogma_effects ?? []).map((effect) => effect.effect_id));
  const kind = effects.has(TURRET_FITTED)
    ? 'turret'
    : effects.has(LAUNCHER_FITTED)
      ? 'launcher'
      : null;
  kindCache.set(typeId, kind);
  return kind;
}
