import { FitGoalModal } from '../FitGoalModal';
import { MilestoneModal } from '../MilestoneModal';
import type { useMilestones } from '../useMilestones';

/** The fit-goal picker and the Plan Milestone name dialog, driven by `useMilestones`. */
export function PlanMilestoneDialogs({
  milestones,
}: {
  milestones: ReturnType<typeof useMilestones>;
}) {
  const {
    milestoneModal,
    setMilestoneModal,
    fitGoalOpen,
    setFitGoalOpen,
    fitGoalPickerOptions,
    pickFitGoal,
    submitMilestoneModal,
  } = milestones;
  return (
    <>
      <FitGoalModal
        open={fitGoalOpen}
        options={fitGoalPickerOptions}
        onClose={() => setFitGoalOpen(false)}
        onPick={pickFitGoal}
      />
      <MilestoneModal
        open={milestoneModal !== null}
        initialName={milestoneModal?.mode === 'rename' ? milestoneModal.currentName : undefined}
        onClose={() => setMilestoneModal(null)}
        onSave={submitMilestoneModal}
      />
    </>
  );
}
