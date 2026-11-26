import type { ReactNode } from 'react';
import type { PlanEntry } from '@/engine/types';
import { Button, SkillBar } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import type { SkillTrainingStatus } from './skillStatus';
import { SkillLink } from '@/features/entities';
import { SkillStatusIcon } from './SkillStatusIcon';

export interface SkillRowProps {
  name: string;
  status: SkillTrainingStatus;
  currentLevel: number;
  timeLabel?: ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  tags?: ReactNode;
  inPlanLabel?: string;
  plannedLevel?: number | null;
  requiredLevel?: number | null;
  skillTypeID?: number;
  planEntries?: readonly PlanEntry[];
}

export function SkillRow({
  name,
  status,
  currentLevel,
  timeLabel,
  onAdd,
  addLabel,
  tags,
  inPlanLabel,
  plannedLevel,
  requiredLevel,
  skillTypeID,
  planEntries,
}: SkillRowProps) {
  const inPlan = status !== 'trained' && inPlanLabel !== undefined;
  const trailing =
    status === 'trained' || inPlan
      ? null
      : onAdd && (
          <Button size="sm" variant="ghost" onClick={onAdd}>
            {addLabel}
          </Button>
        );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <SkillStatusIcon status={status} />
      {skillTypeID !== undefined ? (
        <SkillLink typeId={skillTypeID} planEntries={planEntries} className="flex-auto">
          {name}
        </SkillLink>
      ) : (
        <span className="flex-auto text-text">{name}</span>
      )}
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {tags !== undefined && <span className="flex gap-1">{tags}</span>}
        {inPlan && <Pill tone="accent">{inPlanLabel}</Pill>}
        <SkillBar level={currentLevel} plannedLevel={plannedLevel} requiredLevel={requiredLevel} />
        {timeLabel !== undefined && (
          <span className="w-16 text-right text-text-dim tabular-nums">{timeLabel}</span>
        )}
        {trailing}
      </div>
    </div>
  );
}
