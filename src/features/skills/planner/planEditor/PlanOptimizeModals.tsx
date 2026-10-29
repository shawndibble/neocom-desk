import { useTranslation } from 'react-i18next';
import type { Implants, PlanStep } from '@/engine/types';
import { anchorKeysOf } from '../optimizeHelpers';
import type { OptimizeVerdict } from '../optimizeVerdict';
import { OptimizeForMeModal, RemapPreviewModal } from '../RemapPreviewModal';
import type { usePlanOptimize } from './usePlanOptimize';
import type { PlanScheduleResult } from './usePlanSchedule';

/** The preview modals every optimize flow opens before it changes the plan. */
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
        // `remapNoGain` blames the entry order and points at "Suggest
        // reorder" — true only when a remap was actually weighed and lost,
        // never when there was none to spend. No segments on this branch:
        // a search that found nothing to remap has no plan-as-trained to
        // show, unlike the markers Modal, which already has one.
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
        // Segments are the plan as the markers would train it — worth
        // seeing even when the trade is poor, but not when no marker split
        // anything: the lone "keep current attributes" row would then read
        // as a contradiction of the message above it.
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
