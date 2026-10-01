/**
 * What a freshly created Build Plan starts as.
 *
 * Extracted from `routes/Industry.tsx` when Fit Import (issue #626) became a
 * second creator: an import that built its plans from its own defaults would
 * quietly ignore the facility, hub and build system the pilot already set, and
 * the two would drift apart the next time either was touched.
 *
 * Two sources, for two different questions. *Where* the job runs — facility,
 * rigs, tax, security band, build system and picked place — comes whole from
 * the remembered location for the plan's activity (`facilityDefaults.ts`):
 * the last place the pilot set from a plan page. *Where it trades* — hub and
 * material price basis — still carries from the most recently updated plan
 * (issue #456).
 */

import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { EMPTY_RIG_FIT, FACILITY_PRESETS } from '@/engine/industry/types';
import type { FacilityKind, IndustryActivity } from '@/engine/industry/types';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import {
  DEFAULT_ACTIVITY_FACILITY_DEFAULTS,
  type ActivityFacilityDefaults,
  type FacilityDefaults,
} from './facilityDefaults';

import type { BlueprintCatalogEntry } from './blueprintCatalog';

/**
 * The hardcoded facility per activity, for when the remembered default names
 * one the activity cannot host (issue #460: an NPC station cannot run a
 * reaction, and a refinery cannot manufacture).
 */
export function fallbackFacility(activity: IndustryActivity): FacilityKind {
  return activity === 'reaction' ? 'athanor' : 'npcStation';
}

/**
 * Where a new plan of `activity` builds: the pilot's remembered location for
 * it, or — when that record names a facility the activity cannot host — the
 * hardcoded fallback. Exported so a caller pricing a plan it has not created
 * yet (Opportunities) prices it where the plan will build.
 *
 * Guarded rather than trusted: each store normalises its own record, but a
 * value pulled from a device on an older build has not been through that.
 *
 * Facility, rig fit, tax and place move together, from one source. Taking the
 * facility from one place and the rest from another produces a combination
 * neither source ever held — an NPC station with rigs fitted, or an Athanor
 * labelled with a manufacturing structure's name. So a refused record is
 * refused whole: the fallback brings no rigs, no tax and no place, and builds
 * at the hub in highsec.
 */
export function startingLocation(
  activity: IndustryActivity,
  facilityDefaults: ActivityFacilityDefaults
): FacilityDefaults {
  const forActivity = facilityDefaults[activity];
  return FACILITY_PRESETS[forActivity.facility].activity === activity
    ? forActivity
    : { facility: fallbackFacility(activity), rigFit: EMPTY_RIG_FIT, facilityTaxPct: null };
}

/** The character's own plan with the highest `updatedAt`, or null if they have none yet. */
export function mostRecentlyUpdatedPlan(
  plans: readonly BuildPlanRecord[] | undefined
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
   * Materials to seed as built rather than bought (issue #652 — Opportunities'
   * auto make-or-buy depth pass). Absent rather than an empty array whenever
   * nothing was auto-picked, matching every other optional override here.
   */
  buildHere?: number[];
  /**
   * Overrides `Date.now()`. Fit Import stamps the hull highest in the batch:
   * `mostRecentlyUpdatedPlan` uses a strict `>`, so plans sharing one
   * timestamp tie and array order — effectively UUID order — would otherwise
   * decide what the pilot's *next* hand-made plan defaults from (issue #456).
   */
  updatedAt?: number;
}

// The location — facility, rig, tax, security, build system and build location
// — comes from `facilityDefaults[activity]`, the place the pilot last set from
// a plan page for this activity. Hub and material price basis carry from
// `defaultsFrom`, the character's most recently updated plan (issue #456), or
// fall back to the defaults when it is null/undefined (no plans yet).
export function newBuildPlan(
  characterId: number,
  entry: BlueprintCatalogEntry,
  owned: CharacterBlueprint | null,
  defaultsFrom?: BuildPlanRecord | null,
  facilityDefaults: ActivityFacilityDefaults = DEFAULT_ACTIVITY_FACILITY_DEFAULTS,
  overrides: NewBuildPlanOverrides = {}
): BuildPlanRecord {
  // Unlike `IndustryBlueprint.activity` (optional, for pre-#460 engine test
  // literals), the SDE's own `BlueprintType.activity` is always set — no
  // fallback needed here.
  const activity = entry.blueprint.activity;
  const location = startingLocation(activity, facilityDefaults);
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
    // Same default the in-game Industry window uses: a BPC fills in its
    // remaining runs, a BPO (`runs === -1`, unlimited) starts at 1.
    runs: overrides.runs ?? (owned !== null && owned.runs > 0 ? owned.runs : 1),
    me: overrides.me ?? owned?.material_efficiency ?? assumedMe,
    te: overrides.te ?? owned?.time_efficiency ?? assumedTe,
    facility: location.facility,
    rigFit: location.rigFit,
    // Highsec when the record names no band: a record from before locations
    // were remembered, which is what every plan started at then.
    security: location.security ?? 'highsec',
    hubId: defaultsFrom?.hubId ?? DEFAULT_TRADE_HUB.id,
    // A pilot who builds in one system builds their next thing there too, and
    // re-typing it every plan is the annoyance issue #456 removed. The pair is
    // one fact — a plan holding half of it builds at its hub.
    ...(location.buildSystemId !== undefined && location.buildSystemName !== undefined
      ? { buildSystemId: location.buildSystemId, buildSystemName: location.buildSystemName }
      : {}),
    ...(location.facilityTaxPct != null ? { facilityTaxPct: location.facilityTaxPct } : {}),
    // Carried like the hub it names a side of: a pilot who sources on buy
    // orders sources their next plan that way too.
    ...(defaultsFrom?.materialPriceBasis !== undefined
      ? { materialPriceBasis: defaultsFrom.materialPriceBasis }
      : {}),
    // The picked place itself (#527), from the same record as the facility so
    // its name never labels a job whose numbers came from somewhere else. The
    // id and the name are independently optional — ESI withholds some
    // structure names, and the id alone still drives the picker's stand-in
    // label.
    ...(location.buildLocationId !== undefined
      ? { buildLocationId: location.buildLocationId }
      : {}),
    ...(location.buildLocationName !== undefined
      ? { buildLocationName: location.buildLocationName }
      : {}),
    ...(overrides.buildGroupId !== undefined ? { buildGroupId: overrides.buildGroupId } : {}),
    ...(overrides.buildHere !== undefined ? { buildHere: overrides.buildHere } : {}),
    updatedAt: overrides.updatedAt ?? Date.now(),
  };
}
