import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import {
  FACILITY_PRESETS,
  resolveRigFit,
  type FacilityPreset,
  type IndustryActivity,
} from '@/engine/industry/types';
import type { BuildPlanRecord } from '@/db';
import type { TradeHub } from '@/market/hubs';
import { cx } from '@/lib/cx';
import { materialPriceBasisOf } from './priceBasis';
import { rigFitSummaryLabel } from './rigFitLabels';

interface PlanSetupFactsProps {
  plan: BuildPlanRecord;
  activity: IndustryActivity;
  hub: TradeHub;
  facilityPreset: FacilityPreset;
  buildSystemName: string | null;
  /** The place the pilot picked, by the name they picked it under; null when none was picked. */
  buildLocationName: string | null;
  includeReactions: boolean;
  reactionBuildSystemName: string | null;
  reactionBuildLocationName: string | null;
  reactionsInHighsec: boolean;
  resolvedMe: number;
  resolvedTe: number;
  /**
   * True once the plan resolved and its materials table has no blueprint row
   * (an owned BPO — nothing to buy). Only then does the summary carry ME/TE:
   * the row's tier picker sets them otherwise, and showing them before the
   * plan resolves would flash them in and out.
   */
  lacksBlueprintRow: boolean;
}

/**
 * Read-only summary of the setup on one line at the foot of the verdict hero:
 * dim label then value, no boxes — nothing here is clickable; the Edit setup
 * link beside it opens the form. Runs live in the hero's own title row.
 */
export function PlanSetupFacts({
  plan,
  activity,
  hub,
  facilityPreset,
  buildSystemName,
  buildLocationName,
  includeReactions,
  reactionBuildSystemName,
  reactionBuildLocationName,
  reactionsInHighsec,
  resolvedMe,
  resolvedTe,
  lacksBlueprintRow,
}: PlanSetupFactsProps) {
  const { t } = useTranslation();
  const fact = (label: string, value: string, warn = false) => (
    <div key={label} className="flex min-w-0 items-baseline gap-1.5">
      <dt className="text-text-dim">{label}</dt>
      <dd className={cx('tabular-nums', warn ? 'text-warning' : 'text-text')}>
        {warn && <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" className="mr-1 inline" />}
        {value}
      </dd>
    </div>
  );
  return (
    <dl className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs">
      {activity === 'manufacturing' && lacksBlueprintRow && (
        <>
          {fact(t('industry.setupChipMe'), `${resolvedMe}%`)}
          {fact(t('industry.setupChipTe'), `${resolvedTe}%`)}
        </>
      )}
      {/* The facility · system · band triple only when no place was picked. */}
      {fact(
        t('industry.buildLocation'),
        buildLocationName ??
          `${facilityPreset.name} · ${buildSystemName ?? hub.systemName} · ${t(`industry.${plan.security}`)}`
      )}
      {facilityPreset.structure && (
        <>
          {fact(t('industry.setupChipRig'), rigFitSummaryLabel(resolveRigFit(plan), t))}
          {fact(t('industry.setupChipTax'), `${plan.facilityTaxPct ?? 0}%`)}
        </>
      )}
      {includeReactions &&
        activity !== 'reaction' &&
        fact(
          t('industry.reactionLocation'),
          reactionBuildSystemName === null
            ? t('industry.reactionLocationEntryNotSet')
            : (reactionBuildLocationName ??
                `${FACILITY_PRESETS[plan.reactionFacility ?? 'athanor'].name} · ${reactionBuildSystemName} · ${t(`industry.${plan.reactionSecurity ?? 'highsec'}`)}`),
          reactionsInHighsec
        )}
      {fact(t('industry.tradeHub'), hub.systemName)}
      {fact(
        t('industry.materialPriceBasis'),
        materialPriceBasisOf(plan.materialPriceBasis) === 'buy'
          ? t('industry.materialPriceBasisBuy')
          : t('industry.materialPriceBasisSell')
      )}
    </dl>
  );
}
