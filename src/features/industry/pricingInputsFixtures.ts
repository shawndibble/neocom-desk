/**
 * Test-only Build Plan pricing inputs. Imported by test files only; nothing in
 * the app references this module.
 *
 * Hydrated, at every setting's default, with no corp blueprints, standings or
 * BPC Sourcing rows: what a fresh pilot's inputs read once loaded. A single
 * module-level object, so its identity stays put across renders and a
 * pricing memo keyed on it doesn't re-run.
 */
import { DEFAULT_ASSUMED_ME } from './assumedMe';
import { DEFAULT_INCLUDE_BLUEPRINT_COST } from './includeBlueprintCost';
import type { BuildPlanPricingInputs } from './buildPlanPricingInputs';

export const PRICING_INPUTS_FIXTURE: BuildPlanPricingInputs = {
  hydrated: true,
  assumedMe: DEFAULT_ASSUMED_ME,
  includeBlueprintCost: DEFAULT_INCLUDE_BLUEPRINT_COST,
  corpBlueprints: { blueprints: [], available: false, incomplete: false },
  standings: new Map(),
  bpcRows: [],
};
