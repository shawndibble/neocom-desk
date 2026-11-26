import { useCallback, useEffect, useMemo, useState } from 'react';
import { evaluateFitGoal } from '@/engine/fitGoal';
import { normalizePlanWithBoundaries } from '@/engine/skills/plan';
import { stepKey, type SkillPlanSchedule, type StepKey } from '@/engine/skills/skillPlanSchedule';
import {
  milestoneKey,
  milestoneStates,
  nextMilestone,
  type MilestoneStatus,
} from '@/engine/skills/skillPlanMilestones';
import type { EngineSkill, PlanStep, TrainedSkill } from '@/engine/types';
import type { SkillPlanRecord } from '@/db';
import { fitGoalOptions, isFitGoalPickable, type FitGoalOption } from './fitGoalOptions';
import {
  addMilestone,
  reanchorFitGoals,
  removeMilestone,
  renameMilestone,
  upsertFitGoal,
} from './milestones';
import { appendImport, type SkillPlanEditable } from './skillPlanEdit';
import { useFitGoalNeeds } from './useFitGoalNeeds';

export type MilestoneModalState =
  | { mode: 'add'; skillTypeID: number; level: number }
  | { mode: 'rename'; id: string; currentName: string }
  | null;

interface UseMilestonesArgs {
  characterId: number;
  milestones: SkillPlanRecord['milestones'];
  entries: SkillPlanRecord['entries'];
  engineSkills: ReadonlyMap<number, EngineSkill>;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  editable: SkillPlanEditable;
  scheduled: SkillPlanSchedule['scheduled'];
  stepByKey: SkillPlanSchedule['stepByKey'];
  startDate: Date;
  onUpdate: (patch: Partial<SkillPlanRecord>) => void | Promise<void>;
}

export function useMilestones({
  characterId,
  milestones,
  entries,
  engineSkills,
  trainedSkills,
  editable,
  scheduled,
  stepByKey,
  startDate,
  onUpdate,
}: UseMilestonesArgs) {
  const [milestoneModal, setMilestoneModal] = useState<MilestoneModalState>(null);
  const [fitGoalOpen, setFitGoalOpen] = useState(false);

  const trackedFittingIds = useMemo(
    () => (milestones ?? []).flatMap((m) => (m.fittingId === undefined ? [] : [m.fittingId])),
    [milestones]
  );
  const fitGoalData = useFitGoalNeeds(characterId, trackedFittingIds, fitGoalOpen);
  const fitNeeds = useMemo(
    () =>
      new Map(
        [...fitGoalData.needs].map(([id, need]) => [
          id,
          {
            ...need,
            needed: need.needed.filter((entry) => engineSkills.has(entry.skillTypeID)),
          },
        ])
      ),
    [fitGoalData.needs, engineSkills]
  );
  const trainedLevels = useMemo(
    () => new Map([...trainedSkills].map(([id, skill]) => [id, skill.level])),
    [trainedSkills]
  );
  const goneFittingIds = useMemo(
    () =>
      new Set(
        trackedFittingIds.filter((id) => {
          if (fitGoalData.savedIds && !fitGoalData.savedIds.has(id)) return true;
          const need = fitNeeds.get(id);
          return (
            need !== undefined &&
            evaluateFitGoal(need.needed, trainedLevels, scheduled).state === 'missing'
          );
        })
      ),
    [trackedFittingIds, fitGoalData.savedIds, fitNeeds, trainedLevels, scheduled]
  );
  const milestoneStatuses = useMemo(
    () => milestoneStates(stepByKey, startDate, milestones ?? [], trainedSkills, goneFittingIds),
    [stepByKey, startDate, milestones, trainedSkills, goneFittingIds]
  );
  const milestoneStatusByKey = useMemo(() => {
    const map = new Map<StepKey, MilestoneStatus>();
    for (const status of milestoneStatuses) {
      map.set(milestoneKey(status.milestone), status);
    }
    return map;
  }, [milestoneStatuses]);
  const milestoneStatusFor = useCallback(
    (skillTypeID: number, level: number) =>
      milestoneStatusByKey.get(stepKey({ skillTypeID, level })),
    [milestoneStatusByKey]
  );
  const orphanedMilestones = useMemo(
    () => milestoneStatuses.filter((s) => s.state === 'orphaned'),
    [milestoneStatuses]
  );
  const headerNextMilestone = useMemo(() => {
    const next = nextMilestone(milestoneStatuses);
    return next && next.finish ? { name: next.milestone.name, finish: next.finish } : null;
  }, [milestoneStatuses]);

  const fitGoalPickerOptions = useMemo(
    () =>
      fitGoalOpen
        ? fitGoalOptions(
            fitGoalData.records,
            fitNeeds,
            trainedLevels,
            scheduled,
            stepByKey,
            startDate,
            fitGoalData.unknownIds
          )
        : [],
    [
      fitGoalOpen,
      fitGoalData.records,
      fitGoalData.unknownIds,
      fitNeeds,
      trainedLevels,
      scheduled,
      stepByKey,
      startDate,
    ]
  );

  useEffect(() => {
    if (!milestones?.some((m) => m.fittingId !== undefined)) return;
    const next = reanchorFitGoals(milestones, fitNeeds, trainedLevels, scheduled);
    if (next !== milestones) void onUpdate({ milestones: [...(next ?? [])] });
  }, [milestones, fitNeeds, trainedLevels, scheduled, onUpdate]);

  const handleAddMilestone = useCallback((skillTypeID: number, level: number) => {
    setMilestoneModal({ mode: 'add', skillTypeID, level });
  }, []);

  const handleRenameMilestone = useCallback(
    (milestoneId: string) => {
      const current = (milestones ?? []).find((m) => m.id === milestoneId);
      if (!current) return;
      setMilestoneModal({ mode: 'rename', id: milestoneId, currentName: current.name });
    },
    [milestones]
  );

  const handleRemoveMilestone = useCallback(
    (milestoneId: string) => {
      onUpdate({ milestones: removeMilestone(milestones, milestoneId) });
    },
    [milestones, onUpdate]
  );

  function pickFitGoal(option: FitGoalOption) {
    const need = fitNeeds.get(option.id);
    if (!need || !isFitGoalPickable(option)) return;
    const nextEntries =
      option.state === 'missing' ? (appendImport(editable, option.toAdd).entries ?? []) : null;
    const known = (nextEntries ?? entries).filter((e) => engineSkills.has(e.skillTypeID));
    let steps: PlanStep[];
    try {
      steps = normalizePlanWithBoundaries(known, engineSkills, trainedSkills).steps;
    } catch {
      return;
    }
    const goal = evaluateFitGoal(need.needed, trainedLevels, steps);
    if (!goal.anchor) return;
    onUpdate({
      ...(nextEntries ? { entries: nextEntries } : {}),
      milestones: upsertFitGoal(milestones, { id: option.id, name: need.name }, goal.anchor),
    });
  }

  function submitMilestoneModal(name: string) {
    if (!milestoneModal) return;
    if (milestoneModal.mode === 'add') {
      onUpdate({
        milestones: addMilestone(
          milestones,
          { skillTypeID: milestoneModal.skillTypeID, level: milestoneModal.level },
          name
        ),
      });
    } else {
      onUpdate({ milestones: renameMilestone(milestones, milestoneModal.id, name) });
    }
  }

  return {
    milestoneModal,
    setMilestoneModal,
    fitGoalOpen,
    setFitGoalOpen,
    fitGoalPickerOptions,
    milestoneStatusFor,
    orphanedMilestones,
    headerNextMilestone,
    handleAddMilestone,
    handleRenameMilestone,
    handleRemoveMilestone,
    pickFitGoal,
    submitMilestoneModal,
  };
}
