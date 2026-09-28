/** One skill's status/level/[time]/[Add] row — shared by the Ships panel (Fit Check + Mastery) and Market's Required Skills, which otherwise each hand-rolled the same icon+name+bar layout. */
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
  /** Omit where only a whole group adds at once, not this one skill. */
  onAdd?: () => void;
  addLabel?: string;
  /** Small provenance chips, rendered between the name and the level bar. Omit for none. */
  tags?: ReactNode;
  /** Set when the target plan already covers this row — renders as a static badge in place of the Add button. */
  inPlanLabel?: string;
}

/** No outer padding/border/margin — the caller's own wrapper controls spacing, since the Ships panel and Market's Required Skills each frame this row differently (dividers vs. plain stack). */
export function SkillRow({
  name,
  status,
  currentLevel,
  timeLabel,
  onAdd,
  addLabel,
  tags,
  inPlanLabel,
}: SkillRowProps) {
  const trailing =
    status === 'trained' ? null : inPlanLabel ? (
      <span className="text-text-dim">{inPlanLabel}</span>
    ) : (
      onAdd && (
        <Button size="sm" variant="ghost" onClick={onAdd}>
          {addLabel}
        </Button>
      )
    );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <SkillStatusIcon status={status} />
      <span className="flex-auto text-text">{name}</span>
      {/* Grouped and pushed to the row's own line when there's no room beside
          `name`: `flex-auto` (not `flex-1`'s zero basis) gives `name` a real
          hypothetical width for the wrap decision, so this whole group wraps
          below as a unit rather than `name` being squeezed into a sliver that
          word-breaks mid-word (issue: mobile Market required skills). */}
      <div className="ml-auto flex shrink-0 items-center gap-3">
        {tags !== undefined && <span className="flex gap-1">{tags}</span>}
        <SkillBar level={currentLevel} />
        {timeLabel !== undefined && (
          <span className="w-16 text-right text-text-dim tabular-nums">{timeLabel}</span>
        )}
        {trailing}
      </div>
    </div>
  );
}
