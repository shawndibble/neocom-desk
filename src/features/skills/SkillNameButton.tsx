/**
 * A skill name that opens the shared `SkillDetailModal` — the one trigger
 * every feature rendering a clickable skill name uses, so the affordance
 * (hover underline, accent focus ring) changes in one place. Layout and text
 * color stay the caller's, via `className`.
 */
import type { ReactNode } from 'react';
import type { PlanEntry } from '@/engine/types';
import { cx } from '@/lib/cx';
import { openSkillDetailModal } from '@/stores/skillDetailModal';

export interface SkillNameButtonProps {
  skillTypeID: number;
  /** The open Skill Plan's entries, so prerequisites it already trains read "Planned". */
  planEntries?: readonly PlanEntry[];
  className?: string;
  children: ReactNode;
}

export function SkillNameButton({
  skillTypeID,
  planEntries,
  className,
  children,
}: SkillNameButtonProps) {
  return (
    <button
      type="button"
      onClick={() => openSkillDetailModal(skillTypeID, { planEntries })}
      className={cx(
        'text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        className
      )}
    >
      {children}
    </button>
  );
}
