/** The Build Plan list's filter: its shape, URL codec and the pure predicate. */
import type { TFunction } from 'i18next';
import { summarizeFilterValues, type ActiveFilter } from '@/components/ui';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { boolParam, defineUrlFilter, enumParam, enumSetParam, textParam } from '@/lib/urlState';
import type { BuildGroup } from './buildGroups';
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

/**
 * The filters set away from their default, in the order their controls sit,
 * so a pill reads left to right like the box it opens. `groups` names the
 * picked Build Group; an id it does not hold shows as the bare caption.
 */
export function activePlanFilters(
  filter: BuildPlanFilterState,
  t: TFunction,
  groups: readonly Pick<BuildGroup, 'id' | 'name'>[]
): ActiveFilter<BuildPlanFilterState>[] {
  const active: ActiveFilter<BuildPlanFilterState>[] = [];
  if (filter.ownership !== 'any')
    active.push({
      label: t('industry.planFilters.ownership'),
      value: t(`industry.planFilters.ownerships.${filter.ownership}`),
      clear: (value) => ({ ...value, ownership: DEFAULT_BUILD_PLAN_FILTER.ownership }),
    });
  if (filter.verdicts.size !== PLAN_VERDICTS.length) {
    const names = PLAN_VERDICTS.filter((verdict) => filter.verdicts.has(verdict)).map((verdict) =>
      t(`industry.planFilters.verdicts.${verdict}`)
    );
    active.push({
      label: t('industry.planFilters.verdict'),
      value: names.length === 0 ? t('filters.none') : summarizeFilterValues(names, t),
      clear: (value) => ({ ...value, verdicts: DEFAULT_BUILD_PLAN_FILTER.verdicts }),
    });
  }
  if (filter.activity !== 'any')
    active.push({
      label: t('industry.planFilters.activity'),
      value: t(`industry.planFilters.activities.${filter.activity}`),
      clear: (value) => ({ ...value, activity: DEFAULT_BUILD_PLAN_FILTER.activity }),
    });
  if (filter.group !== GROUP_ANY) {
    const name =
      filter.group === GROUP_NONE
        ? t('industry.planFilters.groupNone')
        : groups.find((group) => group.id === filter.group)?.name;
    active.push({
      label: t('industry.planFilters.group'),
      ...(name !== undefined && { value: name }),
      clear: (value) => ({ ...value, group: DEFAULT_BUILD_PLAN_FILTER.group }),
    });
  }
  if (filter.profitableOnly)
    active.push({
      label: t('industry.planFilters.profit'),
      value: t('industry.planFilters.profitableOnly'),
      clear: (value) => ({ ...value, profitableOnly: DEFAULT_BUILD_PLAN_FILTER.profitableOnly }),
    });
  return active;
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
