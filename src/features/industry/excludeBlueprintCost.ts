/**
 * Whether Blueprint Acquisition's own row (issue #838) counts toward a Build
 * Plan at all — off by default, so an existing plan's materials/rollups keep
 * quoting the row until a pilot who does not want to shop for blueprints on
 * this app opts out. When on, `BuildPlanDetail.tsx` passes
 * `excludeBlueprintCost: true` into `computeBuildPlan`, which threads it down
 * to `buildVsBuy`/`resolveSubBuild` (see `IndustryInputs.excludeBlueprintCost`):
 * every acquisition row disappears from `materials`, and with it from
 * `materialCost`/`totalCost` at every level of the build tree, without
 * disturbing the ME/TE tier `acquisitionFor` already resolved — a plan quotes
 * the same build, just without pricing the blueprint itself.
 *
 * Synced across the pilot's devices, same reasoning as `assumedMe.ts`: "I
 * don't want blueprint cost in my numbers" is a fact about how this pilot
 * accounts for a build, not about whichever screen happens to be open.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const EXCLUDE_BLUEPRINT_COST_SETTING_KEY = 'sync.industryExcludeBlueprintCost';

export const useExcludeBlueprintCost = createSyncedSetting<boolean>({
  key: EXCLUDE_BLUEPRINT_COST_SETTING_KEY,
  defaultValue: false,
});
