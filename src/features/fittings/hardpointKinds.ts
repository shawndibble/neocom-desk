import type { HardpointKind } from '@/engine/fittings/hardpoints';
import { loadTypeDetail } from '@/features/skills/typeDetail';

const LAUNCHER_FITTED = 40;
const TURRET_FITTED = 42;

const kindCache = new Map<number, HardpointKind | null>();

export async function loadHardpointKind(typeId: number): Promise<HardpointKind | null | undefined> {
  const cached = kindCache.get(typeId);
  if (cached !== undefined) return cached;
  const type = await loadTypeDetail(typeId, { retry: true });
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
