import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { exceedsAlphaCap } from '@/engine/alphaCap';
import { romanLevel } from '@/engine/projection';
import type { PlanEntry } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { buildFitCheckRows } from '@/features/skills/ships/fitCheckRows';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
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
  const [added, setAdded] = useState<{
    planId: string;
    planName: string;
    entries: readonly PlanEntry[];
  } | null>(null);
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
                    {row.name} {romanLevel(row.targetLevel)}
                  </span>
                  <span className="text-text-dim">{formatCountdown(row.seconds)}</span>
                  {isEntryCovered(planEntries, row.skillTypeID, row.targetLevel) && (
                    <span className="text-accent">{t('skills.fitCheck.inPlan')}</span>
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
          {target.plans !== undefined && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {added && (
                <span role="status" className="text-success flex items-center gap-2 text-xs">
                  {t('skills.fitCheck.addedToast', {
                    count: added.entries.length,
                    plan: added.planName,
                  })}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      void target.removeEntries(added.planId, added.entries);
                      setAdded(null);
                    }}
                  >
                    {t('skills.fitCheck.addedToastUndo')}
                  </button>
                </span>
              )}
              <TargetPlanPicker target={target} />
              {unplanned.length > 0 && (
                <Button size="sm" variant="primary" onClick={() => void add()}>
                  {target.plans.length === 0
                    ? t('skills.fitCheck.createPlanAndAdd')
                    : t('skills.fitCheck.addAllToPlan')}
                </Button>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
