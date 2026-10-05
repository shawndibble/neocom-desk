import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { SkillLink } from '@/features/entities';
import { AddToPlanBar, type AddedToPlan } from '@/features/skills/AddToPlanBar';
import { exceedsAlphaCap } from '@/engine/alphaCap';
import { romanLevel } from '@/engine/projection';
import type { PlanEntry } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { buildFitCheckRows } from '@/features/skills/ships/fitCheckRows';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { isEntryCovered } from '@/features/skills/planner/reorder';
import { targetPlanEntries, useTargetPlan } from '@/features/skills/useTargetPlan';

interface MissingSkillsChipProps {
  entries: readonly PlanEntry[];
  characterId: number;
  fittingName: string;
}

/**
 * "Missing N skills · <time>" — time at the Character's current attributes
 * and implants, the same schedule a Skill Plan uses. Tapping lists the
 * skills and adds them to a Skill Plan through Fit Check's plan picker.
 */
export function MissingSkillsChip({ entries, characterId, fittingName }: MissingSkillsChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<AddedToPlan | null>(null);
  const { catalog, trainedSkills, attributes, implants } = usePlanEditorData(characterId);
  const target = useTargetPlan(characterId);
  const cloneStates = useCloneStates((state) => state.value);
  const hydrateCloneStates = useCloneStates((state) => state.hydrate);
  useEffect(() => {
    void hydrateCloneStates();
  }, [hydrateCloneStates]);
  const cloneState = cloneStateFor(cloneStates, characterId);

  const rows = useMemo(() => {
    if (!catalog) return null;
    const scheduled = scheduleEntries(entries, {
      skills: catalog.engineSkills,
      trainedSkills,
      attributes,
      implants,
      cloneState,
    });
    return buildFitCheckRows(entries, catalog.engineSkills, trainedSkills, scheduled);
  }, [catalog, entries, trainedSkills, attributes, implants, cloneState]);

  if (!rows || !catalog) return null;
  const totalSeconds = rows.reduce((sum, row) => sum + row.seconds, 0);
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
    // A popover rather than an inline panel: the chip sits in the Fitting's
    // one-row header, which an inline list would push apart.
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="warning">
          {t('fittings.missingSkills.chip', {
            count: rows.length,
            time: formatCountdown(totalSeconds),
          })}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-3">
        <div className="space-y-2">
          <ul className="space-y-1 text-xs">
            {rows.map((row) => {
              const skill = catalog.engineSkills.get(row.skillTypeID);
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
      </PopoverContent>
    </Popover>
  );
}
