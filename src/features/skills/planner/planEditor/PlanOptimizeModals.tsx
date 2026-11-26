import { useTranslation } from 'react-i18next';
import type { Implants, PlanStep } from '@/engine/types';
import { anchorKeysOf } from '../optimizeHelpers';
import type { OptimizeVerdict } from '../optimizeVerdict';
import { OptimizeForMeModal, RemapPreviewModal } from '../RemapPreviewModal';
import type { usePlanOptimize } from './usePlanOptimize';
import type { PlanScheduleResult } from './usePlanSchedule';

export function PlanOptimizeModals({
  optimize,
  schedule,
  markersVerdict,
  effectiveImplants,
  stepLabel,
  nameFor,
}: {
  optimize: ReturnType<typeof usePlanOptimize>;
  schedule: PlanScheduleResult;
  markersVerdict: OptimizeVerdict | null;
  effectiveImplants: Implants;
  stepLabel: (step: PlanStep) => string;
  nameFor: (skillTypeID: number) => string;
}) {
  const { t } = useTranslation();
  const {
    scheduled,
    totalSeconds,
    priorityMap,
    markersResult: markersAtCurrentPositions,
  } = schedule;
  const {
    reorderPreview,
    setReorderPreview,
    acceptReorder,
    optimizeForMePreview,
    acceptOptimizeForMe,
    rejectOptimizeForMe,
    optimizeResult,
    optimizeVerdict,
    acceptOptimizeRemaps,
    rejectOptimizeRemaps,
    markersPanelOpen,
    acceptOptimizeAtMarkers,
    rejectOptimizeAtMarkers,
  } = optimize;
  return (
    <>
      <OptimizeForMeModal
        kind={reorderPreview?.kind}
        preview={
          reorderPreview
            ? {
                order: reorderPreview.order,
                remaps: {
                  segments: [],
                  totalSeconds: reorderPreview.totalSeconds,
                  currentSeconds: reorderPreview.totalSeconds,
                  savingsSeconds: 0,
                },
              }
            : null
        }
        currentOrder={scheduled}
        totalSeconds={totalSeconds}
        prioritized={[...priorityMap.values()].some((priority) => priority !== 'normal')}
        nameFor={nameFor}
        stepLabel={stepLabel}
        implants={effectiveImplants}
        onAccept={acceptReorder}
        onReject={() => setReorderPreview(null)}
      />

      <OptimizeForMeModal
        preview={optimizeForMePreview}
        currentOrder={scheduled}
        totalSeconds={totalSeconds}
        prioritized={[...priorityMap.values()].some((priority) => priority !== 'normal')}
        nameFor={nameFor}
        stepLabel={stepLabel}
        implants={effectiveImplants}
        onAccept={acceptOptimizeForMe}
        onReject={rejectOptimizeForMe}
      />

      <RemapPreviewModal
        title={t('plans.optimizeRemaps')}
        open={optimizeResult !== null}
        verdict={optimizeVerdict}
        segments={optimizeVerdict?.kind === 'saves' && optimizeResult ? optimizeResult : null}
        message={
          optimizeVerdict?.kind === 'noRemapsAvailable'
            ? t('plans.remapNoneAvailable')
            : t('plans.remapNoGain')
        }
        onAccept={acceptOptimizeRemaps}
        onClose={rejectOptimizeRemaps}
        stepByKey={schedule.stepByKey}
        stepLabel={stepLabel}
        implants={effectiveImplants}
      />

      <RemapPreviewModal
        title={t('plans.optimizeAtMarkers')}
        open={markersPanelOpen && markersAtCurrentPositions !== null}
        verdict={markersVerdict}
        segments={
          markersAtCurrentPositions && markersVerdict?.kind !== 'markersAtEnd'
            ? {
                segments: markersAtCurrentPositions.segments,
                anchorKeys: anchorKeysOf(schedule.stepKeys, markersAtCurrentPositions.segments),
              }
            : null
        }
        message={
          markersVerdict?.kind === 'markersAtEnd'
            ? t('plans.markersAtEnd')
            : t('plans.markersNoGain')
        }
        onAccept={acceptOptimizeAtMarkers}
        onClose={rejectOptimizeAtMarkers}
        stepByKey={schedule.stepByKey}
        stepLabel={stepLabel}
        implants={effectiveImplants}
      />
    </>
  );
}
