/**
 * Whether Blueprint Acquisition's resolved cost (issue #838/#839 — what
 * covering a build's blueprint shortfall costs, at whichever ME/TE tier is
 * cheapest) counts toward a plan's `totalCost`/profit, everywhere that number
 * is shown: a plan's own page, the Industry index's Profit column, and a
 * Build Group's rollup (all three price through `useComparedBuildResults` and
 * `BuildPlanDetail.tsx`, which both read this).
 *
 * Default true — blueprint cost counted in, matching what those pages already
 * did once Blueprint Acquisition landed. The toggle exists for a pilot who
 * always builds off an owned/researched BPO and wants "what would it cost to
 * buy the blueprint" left out of the verdict entirely, the same kind of
 * standing assumption `assumedMe.ts` answers for.
 *
 * Synced (`sync.industryIncludeBlueprintCost`): this answers for the pilot's
 * own build philosophy, not for one machine — see `assumedMe.ts`'s doc
 * comment for the identical reasoning.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const INCLUDE_BLUEPRINT_COST_SETTING_KEY = 'sync.industryIncludeBlueprintCost';

export const DEFAULT_INCLUDE_BLUEPRINT_COST = true;

export const useIncludeBlueprintCost = createSyncedSetting<boolean>({
  key: INCLUDE_BLUEPRINT_COST_SETTING_KEY,
  defaultValue: DEFAULT_INCLUDE_BLUEPRINT_COST,
  parse: (raw) => (typeof raw === 'boolean' ? raw : null),
});
