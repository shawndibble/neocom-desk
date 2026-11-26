import { useTranslation } from 'react-i18next';
import type { SkillPlanRecord } from '@/db';
import { Button } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { formatLocalDate } from '@/lib/localDate';
import { useTimeZone } from '@/lib/timeFormat';
import { confirmRemapOutcome } from '../optimizeHelpers';
import type { OptimizeVerdict } from '../optimizeVerdict';
import { OptimizeMenu, type OptimizeMenuItem } from '../OptimizeMenu';
import type { RemapAvailability } from '../remapAvailability';
import { PlanConfirmation } from './PlanConfirmation';
import { PlanToolAction } from './PlanToolAction';
import type { usePlanOptimize } from './usePlanOptimize';
import type { usePlanToolActions } from './usePlanToolActions';

export function ActionsToolSection({
  remapInfo,
  remapCount,
  markers,
  scheduledCount,
  optimize,
  toolActions,
  markersVerdict,
  trainedSkillsKnown,
  onAddFitGoal,
}: {
  remapInfo: RemapAvailability | null;
  remapCount: number;
  markers: SkillPlanRecord['markers'];
  scheduledCount: number;
  optimize: ReturnType<typeof usePlanOptimize>;
  toolActions: ReturnType<typeof usePlanToolActions>;
  markersVerdict: OptimizeVerdict | null;
  trainedSkillsKnown: boolean;
  onAddFitGoal: () => void;
}) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const {
    reorderConfirm,
    optimizeConfirm,
    handleOptimizeForMe,
    handleSuggestReorder,
    handleSortShortest,
    handleOptimizeRemaps,
    handleOptimizeAtMarkers,
  } = optimize;
  const {
    hasTrainedEntries,
    trainedRemoved,
    markerConfirm,
    handleRemoveTrained,
    undoRemoveTrained,
    handleAddMarker,
  } = toolActions;

  const optimizeMenuItems: OptimizeMenuItem[] = [
    {
      key: 'for-me',
      label: t('plans.optimizeForMeItem'),
      hint: t('plans.optimizeForMeHint'),
      disabled: scheduledCount === 0,
      onSelect: handleOptimizeForMe,
    },
    {
      key: 'reorder',
      label: t('plans.optimizeModeReorder'),
      hint: t('plans.optimizeModeReorderHint'),
      disabled: scheduledCount === 0,
      onSelect: handleSuggestReorder,
    },
    {
      key: 'shortest',
      label: t('plans.sortShortest'),
      hint: t('plans.sortShortestTooltip'),
      disabled: scheduledCount === 0,
      onSelect: handleSortShortest,
    },
    {
      key: 'remaps',
      label: t('plans.optimizeModeRemaps'),
      hint: t('plans.optimizeModeRemapsHint'),
      disabled: scheduledCount === 0,
      onSelect: handleOptimizeRemaps,
    },
    {
      key: 'markers',
      label: t('plans.optimizeModeMarkers'),
      hint:
        (markers?.length ?? 0) === 0
          ? t('plans.optimizeModeMarkersDisabledHint')
          : t('plans.optimizeModeMarkersHint'),
      disabled: scheduledCount === 0 || (markers?.length ?? 0) === 0,
      onSelect: handleOptimizeAtMarkers,
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-[0.6875rem] text-text-dim">
        {remapInfo
          ? `${t('plans.remapBudget', { bonus: remapInfo.bonus })} ${
              remapInfo.yearlyReady
                ? t('plans.remapBudgetYearlyReady')
                : t('plans.remapBudgetYearlyFrom', {
                    date: remapInfo.cooldownUntil
                      ? formatLocalDate(remapInfo.cooldownUntil, timeZone)
                      : '',
                  })
            }`
          : t('plans.remapBudgetFallback', { count: remapCount })}
      </p>

      <div className="space-y-1.5">
        <OptimizeMenu items={optimizeMenuItems} disabled={scheduledCount === 0} />
        {reorderConfirm && (
          <PlanConfirmation
            message={t(
              reorderConfirm === 'shortest'
                ? 'plans.sortShortestSuggested'
                : 'plans.reorderSuggested'
            )}
          />
        )}
        {optimizeConfirm && <PlanConfirmation message={optimizeConfirm} />}
        <PlanToolAction
          icon={<Icon.AddMarker size={Icon.ICON_SIZE.sm} />}
          label={t('plans.addMarker')}
          onClick={handleAddMarker}
        />
        <PlanToolAction
          icon={<Icon.Ships size={Icon.ICON_SIZE.sm} />}
          label={t('plans.fitGoal.add')}
          onClick={onAddFitGoal}
        />
        {trainedSkillsKnown && hasTrainedEntries && (
          <PlanToolAction
            icon={<Icon.Done size={Icon.ICON_SIZE.sm} />}
            label={t('plans.removeTrained')}
            onClick={handleRemoveTrained}
          />
        )}
        {trainedRemoved && (
          <PlanConfirmation
            message={t('plans.trainedRemoved', { count: trainedRemoved.count })}
            action={
              <Button size="md" variant="ghost" onClick={undoRemoveTrained}>
                {t('plans.importQueueUndo')}
              </Button>
            }
          />
        )}
        {markerConfirm && <PlanConfirmation message={t('plans.markerAdded')} />}
        {markersVerdict && (
          <p
            className={
              markersVerdict.kind === 'saves' ? 'text-xs text-success' : 'text-xs text-text-dim'
            }
          >
            {confirmRemapOutcome(t, markersVerdict, undefined, timeZone)}
          </p>
        )}
      </div>
    </div>
  );
}
