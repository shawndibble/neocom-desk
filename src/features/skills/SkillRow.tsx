/** One skill's status/level/[time]/[Add] row — shared by Fit Check, Mastery, and Market's Required Skills, which otherwise each hand-rolled the same icon+name+bar layout. */
import type { ReactNode } from 'react';
import { Button, SkillBar } from '@/components/ui';
import type { SkillTrainingStatus } from './skillStatus';
import { SkillStatusIcon } from './SkillStatusIcon';

export interface SkillRowProps {
  name: string;
  status: SkillTrainingStatus;
  currentLevel: number;
  /** Omit where the caller has no schedule-derived time to show (Market's Required Skills). */
  timeLabel?: ReactNode;
  /** Omit where only a whole group adds at once (Mastery's tier-level Add), not this one skill. */
  onAdd?: () => void;
  addLabel?: string;
}

/** No outer padding/border/margin — the caller's own wrapper controls spacing, since Fit Check, Mastery, and Market's Required Skills each frame this row differently (dividers vs. plain stack). */
export function SkillRow({
  name,
  status,
  currentLevel,
  timeLabel,
  onAdd,
  addLabel,
}: SkillRowProps) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <SkillStatusIcon status={status} />
      <span className="flex-1 text-text">{name}</span>
      <SkillBar level={currentLevel} />
      {timeLabel !== undefined && (
        <span className="w-16 text-right text-text-dim tabular-nums">{timeLabel}</span>
      )}
      {status !== 'trained' && onAdd && (
        <Button size="sm" variant="ghost" onClick={onAdd}>
          {addLabel}
        </Button>
      )}
    </div>
  );
}
