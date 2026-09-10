/**
 * What a Build Plan's Reaction Location starts at the first time Include
 * Reactions is turned on for it (issue #698) — a real, explicit Settings-level
 * default, not "copy the most recently edited plan's facility" the way the
 * plan's own primary location seeds a fresh plan (`facilityDefaults.ts`'s own
 * module doc explains why that shortcut doesn't apply to a first plan; here
 * there is no earlier *Reaction Location* to copy from regardless of how many
 * plans exist, since it's a per-plan field only just introduced).
 *
 * Mirrors `facilityDefaults.ts` field-for-field, restricted to a refinery
 * (`athanor`/`tatara`) instead of any facility kind — the one the Reaction
 * Location picker itself is restricted to.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import {
  EMPTY_RIG_FIT,
  FACILITY_PRESETS,
  resolveRigFit,
  type FacilityKind,
  type RigFit,
  type RigKind,
} from '@/engine/industry/types';

export const REACTION_FACILITY_DEFAULTS_SETTING_KEY = 'sync.industryReactionFacilityDefaults';

export interface ReactionFacilityDefaults {
  facility: FacilityKind;
  rigFit: RigFit;
  facilityTaxPct: number | null;
}

/** An unfitted Athanor — the smaller, more commonly available refinery. */
export const DEFAULT_REACTION_FACILITY_DEFAULTS: ReactionFacilityDefaults = {
  facility: 'athanor',
  rigFit: EMPTY_RIG_FIT,
  facilityTaxPct: null,
};

const RIG_KINDS: readonly RigKind[] = ['none', 'meT1', 'meT2', 'teT1', 'teT2'];

/**
 * A facility whose preset isn't a reaction one is incoherent for this
 * setting — normalised to the default rather than rejected outright, the
 * same "the facility is what the pilot chose" reasoning
 * `normalizeFacilityDefaults` uses for a non-structure. There is no partial
 * fix here the way there is for a non-structure's rig/tax, since the whole
 * record only means anything for a refinery.
 */
export function normalizeReactionFacilityDefaults(
  value: ReactionFacilityDefaults
): ReactionFacilityDefaults {
  if (FACILITY_PRESETS[value.facility].activity === 'reaction') return value;
  return DEFAULT_REACTION_FACILITY_DEFAULTS;
}

function parseReactionFacilityDefaults(raw: unknown): ReactionFacilityDefaults | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as { facility?: unknown; rigFit?: unknown; facilityTaxPct?: unknown };
  if (typeof record.facility !== 'string' || !(record.facility in FACILITY_PRESETS)) return null;
  const hasRigFit =
    record.rigFit === undefined ||
    (Array.isArray(record.rigFit) && record.rigFit.every((k) => RIG_KINDS.includes(k as RigKind)));
  if (!hasRigFit) return null;
  const tax = record.facilityTaxPct;
  if (
    tax !== null &&
    tax !== undefined &&
    (typeof tax !== 'number' || !Number.isFinite(tax) || tax < 0)
  )
    return null;
  return normalizeReactionFacilityDefaults({
    facility: record.facility as FacilityKind,
    rigFit: resolveRigFit({ rigFit: record.rigFit as RigKind[] | undefined }),
    facilityTaxPct: (tax as number | null | undefined) ?? null,
  });
}

export const useReactionFacilityDefaults = createSyncedSetting<ReactionFacilityDefaults>({
  key: REACTION_FACILITY_DEFAULTS_SETTING_KEY,
  defaultValue: DEFAULT_REACTION_FACILITY_DEFAULTS,
  parse: parseReactionFacilityDefaults,
});
