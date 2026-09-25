import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { exceedsAlphaCap } from '@/engine/alphaCap';
import { romanLevel } from '@/engine/projection';
import type { PlanEntry } from '@/engine/types';
import { formatDuration } from '@/lib/duration';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { buildFitCheckRows } from '@/features/skills/ships/fitCheckRows';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import { useTargetPlan } from '@/features/skills/useTargetPlan';

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

  return (
    // A popover rather than an inline panel: the chip sits in the Fitting's
    // one-row header, which an inline list would push apart.
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="min-h-11 rounded-xs border border-line bg-panel-2 px-3 text-xs font-semibold text-warning md:min-h-9"
        >
          {t('fittings.missingSkills.chip', {
            count: rows.length,
            time: formatDuration(totalSeconds),
          })}
        </button>
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
                  <span className="text-text-dim">{formatDuration(row.seconds)}</span>
                  {capped && <span className="text-warning">{t('plans.alphaCapped')}</span>}
                </li>
              );
            })}
          </ul>
          {target.plans !== undefined && (
            <div className="flex items-center justify-end gap-2">
              <TargetPlanPicker target={target} />
              <Button
                size="sm"
                variant="primary"
                onClick={() => void target.addEntries(entries, fittingName)}
              >
                {target.plans.length === 0
                  ? t('skills.fitCheck.createPlanAndAdd')
                  : t('skills.fitCheck.addAllToPlan')}
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
