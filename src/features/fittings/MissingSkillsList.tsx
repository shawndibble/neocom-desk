import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SkillLink } from '@/features/entities';
import { AddToPlanBar, type AddedToPlan } from '@/features/skills/AddToPlanBar';
import { exceedsAlphaCap } from '@/engine/alphaCap';
import { romanLevel } from '@/engine/projection';
import type { PlanEntry } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { isEntryCovered } from '@/features/skills/planner/reorder';
import { targetPlanEntries, useTargetPlan } from '@/features/skills/useTargetPlan';
import type { MissingSkillRows } from './useMissingSkillRows';

interface MissingSkillsListProps {
  entries: readonly PlanEntry[];
  characterId: number;
  /** Names a new Skill Plan the skills go into. */
  fittingName: string;
  missing: MissingSkillRows;
}

/**
 * The missing skills, each with its time and whether a Skill Plan already
 * covers it, and Fit Check's plan picker to add the rest.
 */
export function MissingSkillsList({
  entries,
  characterId,
  fittingName,
  missing,
}: MissingSkillsListProps) {
  const { t } = useTranslation();
  const [added, setAdded] = useState<AddedToPlan | null>(null);
  const target = useTargetPlan(characterId);
  const { rows, skills, cloneState } = missing;
  const planEntries = targetPlanEntries(target);
  const unplanned = entries.filter(
    (e) => !isEntryCovered(planEntries, e.skillTypeID, e.targetLevel)
  );
  const plannedCount = entries.length - unplanned.length;

  async function add() {
    const result = await target.addEntries(unplanned, fittingName);
    if (result.added.length === 0) return;
    setAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1 text-xs">
        {rows.map((row) => {
          const skill = skills.get(row.skillTypeID);
          const capped =
            cloneState === 'alpha' &&
            skill !== undefined &&
            exceedsAlphaCap(skill, row.targetLevel);
          return (
            <li key={row.skillTypeID} className="flex flex-wrap items-center gap-x-2">
              <span className="text-text">
                <SkillLink typeId={row.skillTypeID} planEntries={planEntries}>
                  {row.name}
                </SkillLink>{' '}
                {romanLevel(row.targetLevel)}
              </span>
              <span className="text-text-dim">{formatCountdown(row.seconds)}</span>
              {isEntryCovered(planEntries, row.skillTypeID, row.targetLevel) && (
                <span className="text-success">{t('skills.fitCheck.inPlan')}</span>
              )}
              {capped && <span className="text-warning">{t('plans.alphaCapped')}</span>}
            </li>
          );
        })}
      </ul>
      {plannedCount > 0 && (
        <p className="text-text-dim text-xs">
          {unplanned.length === 0
            ? t('skills.fitCheck.allPlanned')
            : t('skills.fitCheck.alreadyPlanned', { count: plannedCount })}
        </p>
      )}
      <AddToPlanBar
        target={target}
        unplannedCount={unplanned.length}
        added={added}
        onAdd={() => void add()}
        onUndo={() => {
          if (!added) return;
          void target.removeEntries(added.planId, added.entries);
          setAdded(null);
        }}
      />
    </div>
  );
}
