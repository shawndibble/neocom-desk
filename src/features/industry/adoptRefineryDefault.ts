import { db } from '@/db';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import { DEFAULT_FACILITY_DEFAULTS, FACILITY_DEFAULTS_SETTING_KEY } from './facilityDefaults';
import { REACTION_FACILITY_DEFAULTS_SETTING_KEY } from './reactionFacilityDefaults';

function storedFacilityKind(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const facility = (value as { facility?: unknown }).facility;
  return typeof facility === 'string' && facility in FACILITY_PRESETS ? facility : null;
}

export async function adoptRefineryDefaultAsReactionLocation(): Promise<void> {
  try {
    const manufacturing = await db.settings.get(FACILITY_DEFAULTS_SETTING_KEY);
    const kind = storedFacilityKind(manufacturing?.value);
    if (kind === null || FACILITY_PRESETS[kind as never] === undefined) return;
    if (FACILITY_PRESETS[kind as never]['activity'] !== 'reaction') return;

    const reaction = await db.settings.get(REACTION_FACILITY_DEFAULTS_SETTING_KEY);
    if (reaction !== undefined) return;

    await db.settings.put({
      key: REACTION_FACILITY_DEFAULTS_SETTING_KEY,
      value: manufacturing?.value,
    });
    await db.settings.put({
      key: FACILITY_DEFAULTS_SETTING_KEY,
      value: DEFAULT_FACILITY_DEFAULTS,
    });
  } catch {}
}
