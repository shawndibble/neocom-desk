/**
 * What a freshly created Build Plan starts as.
 *
 * Extracted from `routes/Industry.tsx` when Fit Import (issue #626) became a
 * second creator: an import that built its plans from its own defaults would
 * quietly ignore the facility, hub and build system the pilot already set, and
 * the two would drift apart the next time either was touched.
 */

import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { EMPTY_RIG_FIT, FACILITY_PRESETS, resolveRigFit } from '@/engine/industry/types';
import type { FacilityKind, IndustryActivity } from '@/engine/industry/types';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { DEFAULT_FACILITY_DEFAULTS, type FacilityDefaults } from './facilityDefaults';
import type { BlueprintCatalogEntry } from './blueprintCatalog';

/**
 * The historical hardcoded default per activity — a character with no prior
 * plan of that activity, or whose most recent plan is the other activity
 * (issue #460: `defaultsFrom.facility` would otherwise be an NPC station
 * that cannot host a reaction, or a refinery that cannot manufacture).
 */
export function fallbackFacility(activity: IndustryActivity): FacilityKind {
  return activity === 'reaction' ? 'athanor' : 'npcStation';
}

/** The character's own plan with the highest `updatedAt`, or null if they have none yet. */
export function mostRecentlyUpdatedPlan(
  plans: BuildPlanRecord[] | undefined
): BuildPlanRecord | null {
  if (!plans || plans.length === 0) return null;
  return plans.reduce((latest, p) => (p.updatedAt > latest.updatedAt ? p : latest));
}

/** Fields a caller may set on the new plan beyond what the defaults decide. */
export interface NewBuildPlanOverrides {
  runs?: number;
  /**
   * ME/TE of the specific blueprint copy this plan is quoting — a BPC Sourcing
   * Offer's own research, carried through the context menu (issue #637).
   * Beats an owned copy *and* the assumed-ME/TE preferences: the pilot is
   * judging a copy they might buy, not the one already in the hangar. Seeded 0
   * is a real answer about a real copy, so this is `??`-chained and never
   * truthiness-checked.
   */
  me?: number;
  te?: number;
  /**
   * The plan's name, where the caller has a better one than the bare product
   * name — a seeded plan reads "Rifter 10/20 x5" so a pilot holding a plain
   * plan and one or more seeded plans for one blueprint can tell them apart.
   * Composed at the UI layer, which is where i18next lives.
   */
  name?: string;
  /**
   * ME for a blueprint the character does not own a copy of. Fit Import
   * passes the assumed-ME preference here: most of a T2 fit needs an invented
   * BPC, and quoting all of it at ME0 overstates the group's material cost.
   * An owned copy still wins, the same precedence `materialEfficiencyFor`
   * applies to sub-jobs.
   */
  assumedMe?: number;
  /**
   * TE for a blueprint the character does not own a copy of (issue #634), from
   * the preference beside the ME one. Separate rather than packed with it: the
   * pair a real invented BPC carries is ME2 / TE4, so one number cannot
   * answer for both, and material cost and job time are different questions a
   * pilot may want answered differently. Same precedence — an owned copy's
   * real TE wins.
   */
  assumedTe?: number;
  buildGroupId?: string;
  /**
   * Overrides `Date.now()`. Fit Import stamps the hull highest in the batch:
   * `mostRecentlyUpdatedPlan` uses a strict `>`, so plans sharing one
   * timestamp tie and array order — effectively UUID order — would otherwise
   * decide what the pilot's *next* hand-made plan defaults from (issue #456).
   */
  updatedAt?: number;
}

// Facility/rig/security/hub/tax, build system and build location all default
// from the character's own most recently updated plan (issue #456), so a
// second plan doesn't force re-picking settings the pilot already set once. `defaultsFrom` is that
// plan, or null/undefined for a character with no plans yet, in which case
// the historical hardcoded defaults apply. Only carried when it hosts the
// same activity as the new plan (issue #460) — otherwise it names a
// facility the new blueprint/formula cannot run at.
export function newBuildPlan(
  characterId: number,
  entry: BlueprintCatalogEntry,
  owned: CharacterBlueprint | null,
  defaultsFrom?: BuildPlanRecord | null,
  facilityDefaults: FacilityDefaults = DEFAULT_FACILITY_DEFAULTS,
  overrides: NewBuildPlanOverrides = {}
): BuildPlanRecord {
  // Unlike `IndustryBlueprint.activity` (optional, for pre-#460 engine test
  // literals), the SDE's own `BlueprintType.activity` is always set — no
  // fallback needed here.
  const activity = entry.blueprint.activity;
  const defaultsMatchActivity =
    defaultsFrom != null && FACILITY_PRESETS[defaultsFrom.facility].activity === activity;
  // The pilot's own default, but only where it can host this activity — a
  // refinery cannot manufacture and an NPC station cannot run a reaction, the
  // same guard `fallbackFacility` exists for.
  const preferred =
    FACILITY_PRESETS[facilityDefaults.facility].activity === activity ? facilityDefaults : null;
  /**
   * Facility, rig fit and owner-set tax move together, from one source.
   *
   * Taking the facility from one place and the rig from another produces a
   * combination neither source ever held — an NPC station with rigs fitted,
   * which `normalizeFacilityDefaults` refuses to even store. It also made the
   * pilot's configured rig and tax unreachable: any earlier plan, whatever its
   * activity, supplied a rig fit and won.
   */
  const facilityConfig: FacilityDefaults = defaultsMatchActivity
    ? {
        facility: defaultsFrom.facility,
        rigFit: resolveRigFit(defaultsFrom),
        facilityTaxPct: defaultsFrom.facilityTaxPct ?? null,
      }
    : (preferred ?? {
        facility: fallbackFacility(activity),
        rigFit: EMPTY_RIG_FIT,
        facilityTaxPct: null,
      });
  // One precedence order for research, everywhere, and the same one on both
  // lines below: an explicit per-copy seed (#637) beats an owned copy, and an
  // owned blueprint's real research beats the assumed value (#634) — the
  // assumption exists to fill the gap where there is nothing to read, and the
  // seed exists because the pilot is quoting a copy that is not theirs yet.
  const assumedMe = overrides.assumedMe ?? 0;
  const assumedTe = overrides.assumedTe ?? 0;
  return {
    id: crypto.randomUUID(),
    characterId,
    name: overrides.name ?? entry.productName,
    blueprintTypeID: entry.blueprintTypeID,
    runs: overrides.runs ?? 1,
    me: overrides.me ?? owned?.material_efficiency ?? assumedMe,
    te: overrides.te ?? owned?.time_efficiency ?? assumedTe,
    facility: facilityConfig.facility,
    rigFit: facilityConfig.rigFit,
    security: defaultsFrom?.security ?? 'highsec',
    hubId: defaultsFrom?.hubId ?? DEFAULT_TRADE_HUB.id,
    // Carried like facility/rig/hub: a pilot who builds in one system builds
    // their next thing there too, and re-typing it every plan is the annoyance
    // issue #456 removed for the settings beside it.
    ...(defaultsFrom?.buildSystemId !== undefined
      ? { buildSystemId: defaultsFrom.buildSystemId, buildSystemName: defaultsFrom.buildSystemName }
      : {}),
    ...(facilityConfig.facilityTaxPct != null
      ? { facilityTaxPct: facilityConfig.facilityTaxPct }
      : {}),
    // Carried like the hub it names a side of: a pilot who sources on buy
    // orders sources their next plan that way too.
    ...(defaultsFrom?.materialPriceBasis !== undefined
      ? { materialPriceBasis: defaultsFrom.materialPriceBasis }
      : {}),
    // The picked place itself (#527), carried under the same activity check as
    // `facility` rather than merely when the source plan has one: where the
    // activity differs the new plan's facility is the hardcoded fallback, not
    // the picked place's, so its name would label a job whose numbers came
    // from somewhere else. The id and the name are independently optional —
    // ESI withholds some structure names, and the id alone still drives the
    // picker's stand-in label.
    ...(defaultsMatchActivity && defaultsFrom.buildLocationId !== undefined
      ? { buildLocationId: defaultsFrom.buildLocationId }
      : {}),
    ...(defaultsMatchActivity && defaultsFrom.buildLocationName !== undefined
      ? { buildLocationName: defaultsFrom.buildLocationName }
      : {}),
    ...(overrides.buildGroupId !== undefined ? { buildGroupId: overrides.buildGroupId } : {}),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}
