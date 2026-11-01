/** The Build Plan list's filter: its shape, URL codec and the pure predicate. */
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { boolParam, defineUrlFilter, enumParam, enumSetParam, textParam } from '@/lib/urlState';
import type { PlanIndexStats, PlanVerdictTag } from './BuildPlanList';

/** Which copy of a plan's blueprint the pilot holds. `owned` is any copy; `none` is neither. */
export const PLAN_OWNERSHIPS = ['any', 'owned', 'bpo', 'bpc', 'none'] as const;
export type PlanOwnership = (typeof PLAN_OWNERSHIPS)[number];

export const PLAN_VERDICTS = [
  'build',
  'buy',
  'unknown',
  'fixLocation',
] as const satisfies readonly PlanVerdictTag[];

export const PLAN_ACTIVITIES = ['any', 'manufacturing', 'reaction'] as const;
export type PlanActivityFilter = (typeof PLAN_ACTIVITIES)[number];

/** `GROUP_ANY` / `GROUP_NONE` stand beside real Build Group ids in `group`; ids are UUIDs, so they cannot collide. */
export const GROUP_ANY = 'any';
export const GROUP_NONE = 'none';

export interface BuildPlanFilterState {
  ownership: PlanOwnership;
  verdicts: ReadonlySet<PlanVerdictTag>;
  profitableOnly: boolean;
  activity: PlanActivityFilter;
  group: string;
}

export const BUILD_PLAN_FILTER = defineUrlFilter<BuildPlanFilterState>({
  ownership: { key: 'plans.owns', codec: enumParam(PLAN_OWNERSHIPS, 'any') },
  verdicts: { key: 'plans.verdicts', codec: enumSetParam(PLAN_VERDICTS) },
  profitableOnly: { key: 'plans.profitable', codec: boolParam() },
  activity: { key: 'plans.activity', codec: enumParam(PLAN_ACTIVITIES, 'any') },
  group: { key: 'plans.group', codec: textParam({ defaultValue: GROUP_ANY }) },
});

export const DEFAULT_BUILD_PLAN_FILTER: BuildPlanFilterState = {
  ownership: 'any',
  verdicts: new Set(PLAN_VERDICTS),
  profitableOnly: false,
  activity: 'any',
  group: GROUP_ANY,
};

export function activePlanFilterCount(filter: BuildPlanFilterState): number {
  return [
    filter.ownership !== 'any',
    filter.verdicts.size !== PLAN_VERDICTS.length,
    filter.profitableOnly,
    filter.activity !== 'any',
    filter.group !== GROUP_ANY,
  ].filter(Boolean).length;
}

interface FilterContext {
  /** The active pilot's blueprints. */
  owned: readonly CharacterBlueprint[];
  activityOf: (plan: BuildPlanRecord) => 'manufacturing' | 'reaction' | undefined;
  statsByPlanId: ReadonlyMap<string, PlanIndexStats>;
  /** Ids of groups that exist; a plan pointing elsewhere counts as ungrouped, as the list shows it. */
  knownGroupIds?: ReadonlySet<string>;
}

export function filterPlans(
  plans: readonly BuildPlanRecord[],
  filter: BuildPlanFilterState,
  ctx: FilterContext
): readonly BuildPlanRecord[] {
  if (activePlanFilterCount(filter) === 0) return plans;
  const hasBpo = new Set<number>();
  const hasBpc = new Set<number>();
  for (const b of ctx.owned) (b.runs === -1 ? hasBpo : hasBpc).add(b.type_id);
  return plans.filter((plan) => {
    const id = plan.blueprintTypeID;
    const owns = {
      any: true,
      owned: hasBpo.has(id) || hasBpc.has(id),
      bpo: hasBpo.has(id),
      bpc: hasBpc.has(id),
      none: !hasBpo.has(id) && !hasBpc.has(id),
    }[filter.ownership];
    if (!owns) return false;
    const stats = ctx.statsByPlanId.get(plan.id);
    if (!filter.verdicts.has(stats?.verdict ?? 'unknown')) return false;
    if (filter.profitableOnly) {
      if (!stats || stats.verdict === 'fixLocation' || (stats.profit ?? 0) <= 0) return false;
    }
    if (filter.activity !== 'any' && ctx.activityOf(plan) !== filter.activity) return false;
    if (filter.group !== GROUP_ANY) {
      const groupId =
        plan.buildGroupId !== undefined && (ctx.knownGroupIds?.has(plan.buildGroupId) ?? true)
          ? plan.buildGroupId
          : undefined;
      if (filter.group === GROUP_NONE ? groupId !== undefined : groupId !== filter.group)
        return false;
    }
    return true;
  });
}
