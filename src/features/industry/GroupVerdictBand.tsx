import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import type { BuildPlanRecord } from '@/db';
import type { MaterialVolumeTotals } from '@/engine/industry/materialVolume';
import { iskToneClass } from '@/features/character/format';
import { cx } from '@/lib/cx';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import type { BlueprintCatalog } from './blueprintCatalog';
import { formatPercent, formatVolume } from './format';
import { hubLabel } from './groupHubLabel';
import type { GroupRollupView } from './groupRollupView';
import { PlanScheduleLine } from './PlanScheduleLine';
import { planJobNodes, usePlanSchedule } from './planJobSlots';

interface GroupVerdictBandProps {
  view: GroupRollupView;
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog;
  groupVolume: MaterialVolumeTotals;
}

export function GroupVerdictBand({ view, plans, catalog, groupVolume }: GroupVerdictBandProps) {
  const { t } = useTranslation();
  const { members, rollup } = view;
  const groupProfit = view.savings;
  const groupVerdict = view.verdict;
  const buildIsCheaper = groupProfit !== null && (groupVerdict === 'build' || groupProfit > 0);

  const groupJobNodes = useMemo(() => {
    const byId = new Map(plans.map((p) => [p.id, p]));
    return members.flatMap((member, i) => {
      const plan = byId.get(member.planId);
      const activity = plan
        ? (catalog.byBlueprintTypeID.get(plan.blueprintTypeID)?.blueprint.activity ??
          'manufacturing')
        : 'manufacturing';
      return planJobNodes(
        {
          activity,
          seconds: member.result.seconds,
          jobRuns: member.result.jobRuns,
          materials: member.result.materials,
          blueprintTypeID: plan?.blueprintTypeID,
        },
        catalog,
        `${i}:`
      );
    });
  }, [members, plans, catalog]);
  const groupSchedule = usePlanSchedule(plans[0]?.characterId ?? null, groupJobNodes);

  const verdictQualifiers = useMemo(() => {
    const material = t('industry.groupVerdictMaterial', { amount: formatIsk(rollup.materialCost) });
    const jobFees = t('industry.groupVerdictJobFees', {
      amount: formatIsk(rollup.topLevelJobFees),
    });
    const duration = formatDuration(rollup.seconds);
    const volume = t(
      groupVolume.anyUnknown ? 'industry.groupVerdictVolumeAtLeast' : 'industry.groupVerdictVolume',
      { volume: formatVolume(groupVolume.volume) }
    );
    if (groupProfit === null || rollup.buyCost === null) {
      return [material, jobFees, duration, volume].join(' · ');
    }
    const pct = buildIsCheaper
      ? rollup.buyCost > 0
        ? (groupProfit / rollup.buyCost) * 100
        : null
      : rollup.totalCost > 0
        ? (-groupProfit / rollup.totalCost) * 100
        : null;
    const hub = rollup.singleHub ? hubLabel(rollup.hubIds[0]) : null;
    const comparisonKey = buildIsCheaper
      ? hub
        ? 'industry.groupVerdictCheaperAt'
        : 'industry.groupVerdictCheaper'
      : hub
        ? 'industry.groupVerdictMoreAt'
        : 'industry.groupVerdictMore';
    const comparison = pct === null ? null : t(comparisonKey, { percent: formatPercent(pct), hub });
    return [comparison, material, jobFees, duration, volume].filter(Boolean).join(' · ');
  }, [
    groupProfit,
    buildIsCheaper,
    groupVolume,
    rollup.buyCost,
    rollup.totalCost,
    rollup.materialCost,
    rollup.topLevelJobFees,
    rollup.seconds,
    rollup.singleHub,
    rollup.hubIds,
    t,
  ]);

  return (
    <div
      data-testid="group-verdict-band"
      className={cx(
        'flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xs border p-3',
        groupProfit === null
          ? 'border-line'
          : groupVerdict === 'build'
            ? 'border-accent-dim bg-accent/5'
            : 'border-warning/50 bg-warning/10'
      )}
    >
      <p
        className={cx(
          'inline-flex items-center gap-1.5 text-base font-semibold tabular-nums',
          groupProfit === null
            ? 'text-text-dim'
            : groupVerdict === 'unknown'
              ? 'text-warning'
              : iskToneClass(groupProfit)
        )}
      >
        <span className="sr-only">{t('industry.acquisitionVerdictLabel')} </span>
        {groupProfit === null ? (
          <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
        ) : groupVerdict === 'build' ? (
          <Icon.Done size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
        ) : (
          <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" className="shrink-0" />
        )}
        {groupProfit === null
          ? t('industry.verdictUnknown')
          : groupVerdict === 'build'
            ? t('industry.verdictBuild', { amount: formatIsk(groupProfit) })
            : buildIsCheaper
              ? t('industry.verdictBuildCheaper', { amount: formatIsk(groupProfit) })
              : t('industry.verdictBuy', { amount: formatIsk(-groupProfit) })}
      </p>
      <p className="text-xs tabular-nums text-text-dim">{verdictQualifiers}</p>
      {rollup.unpriceable && (
        <p className="basis-full text-xs text-warning">{t('industry.groupUnpriceable')}</p>
      )}
      {plans.length > 0 && groupSchedule && (
        <div className="basis-full">
          <PlanScheduleLine plan={groupSchedule} />
        </div>
      )}
    </div>
  );
}
