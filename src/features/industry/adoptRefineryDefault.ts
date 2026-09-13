/**
 * One-time move of a refinery left in the manufacturing facility default.
 *
 * Before a default existed per activity, `sync.industryFacilityDefaults` held
 * the only facility a plan could be seeded from, and `newBuildPlan` applied it
 * only to plans of that facility's own activity. So storing a Tatara there was
 * how a pilot said "my reaction plans start at my rigged Tatara" — the
 * manufacturing half simply went unused. Now that reactions read their own
 * key, that record would be read by nothing and the picker no longer offers
 * it, so the intent has to move rather than evaporate.
 *
 * Runs before either store hydrates (`app/App.tsx` gates the first render on
 * it), because both would otherwise read the rows this rewrites.
 */
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

    // Only when the pilot has said nothing about their Reaction Location yet.
    // A real answer there outranks one inferred from the other key.
    const reaction = await db.settings.get(REACTION_FACILITY_DEFAULTS_SETTING_KEY);
    if (reaction !== undefined) return;

    // Unstamped, exactly as `useSyncedSetting`'s `legacyKey` adoption is: a
    // value this device may have set months ago must not outrank a real edit
    // made on another device yesterday. `mergeSettings` lets any remote copy
    // win, and with no remote copy it pushes as-is.
    await db.settings.put({
      key: REACTION_FACILITY_DEFAULTS_SETTING_KEY,
      value: manufacturing?.value,
    });
    // The vacated key goes back to its own default rather than being deleted:
    // a delete propagates as a tombstone, and this is not a delete.
    await db.settings.put({
      key: FACILITY_DEFAULTS_SETTING_KEY,
      value: DEFAULT_FACILITY_DEFAULTS,
    });
  } catch {
    // Private browsing, over quota, a damaged store: the pilot keeps whatever
    // the stores read, which is the pre-migration behaviour. Never a reason to
    // hold up boot.
  }
}
