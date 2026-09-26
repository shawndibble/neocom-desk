import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  FilterChip,
  Popover,
  PopoverContent,
  PopoverTrigger,
  sortRows,
  Toast,
} from '@/components/ui';
import { romanLevel } from '@/engine/projection';
import type { PlanEntry } from '@/engine/types';
import { formatDuration } from '@/lib/duration';
import { loadMasteries } from '@/sde/loadSde';
import type { MasteryMap } from '@/sde/types';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { isEntryCovered } from '@/features/skills/planner/reorder';
import { buildFitCheckRows } from '@/features/skills/ships/fitCheckRows';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import {
  masteryRowSortValue,
  mergeShipEntries,
  tagUnifiedRows,
} from '@/features/skills/ships/unifiedShipRows';
import { SkillRow } from '@/features/skills/SkillRow';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import { useTargetPlan } from '@/features/skills/useTargetPlan';

const TIERS = [0, 1, 2, 3, 4] as const;
const TOAST_MS = 8000;

interface MasteryChipProps {
  hullTypeId: number;
  hullName: string;
  characterId: number;
}

/**
 * "Mastery" — what skills a hull's Mastery tiers ask for and how long they
 * take at the active Character's attributes and implants, no fit required.
 * The tier picker shows the union of tiers I..N deduped by skill; Add All puts
 * exactly the untrained rows on screen into a Skill Plan. Renders nothing for
 * a hull `masteries.json` carries no data for.
 */
export function MasteryChip({ hullTypeId, hullName, characterId }: MasteryChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [masteries, setMasteries] = useState<MasteryMap | null>(null);
  const [tier, setTier] = useState(4);
  const [hideCompleted, setHideCompleted] = useState(false);
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

  useEffect(() => {
    void loadMasteries().then(setMasteries);
  }, []);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [added]);

  const tiers = masteries?.[String(hullTypeId)];
  const hasData = tiers !== undefined && tiers.some((bundle) => bundle.length > 0);

  const rows = useMemo(() => {
    if (!catalog || !tiers) return null;
    const merged = mergeShipEntries(tiers.slice(0, tier + 1), null);
    const scheduled = scheduleEntries(merged.entries, {
      skills: catalog.engineSkills,
      trainedSkills,
      attributes,
      implants,
      cloneState,
    });
    const built = buildFitCheckRows(merged.entries, catalog.engineSkills, trainedSkills, scheduled);
    // Grouped by the tier that first asks for the skill, quickest first inside a tier.
    return sortRows(
      tagUnifiedRows(built, merged.highestMasteryTier, merged.fromFit),
      { sortValue: masteryRowSortValue },
      'asc'
    );
  }, [catalog, tiers, tier, trainedSkills, attributes, implants, cloneState]);

  if (!hasData || !rows) return null;

  const visible = hideCompleted ? rows.filter((row) => row.status !== 'trained') : rows;
  const untrained = visible.filter((row) => row.status !== 'trained');
  const totalSeconds = untrained.reduce((sum, row) => sum + row.seconds, 0);
  const planEntries = target.plans?.find((p) => p.id === target.targetPlanId)?.entries ?? [];

  async function add(entries: readonly PlanEntry[]) {
    const result = await target.addEntries(entries, hullName);
    if (result.added.length === 0) return;
    setAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="min-h-11 rounded-xs border border-line bg-panel-2 px-3 text-xs font-semibold text-text md:min-h-9"
          >
            {t('fittings.mastery.chip')}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] p-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-text">
              {t('fittings.mastery.title', { name: hullName })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {TIERS.map((n) => (
                <FilterChip
                  key={n}
                  label={romanLevel(n + 1)}
                  selected={tier === n}
                  onToggle={() => setTier(n)}
                />
              ))}
              <FilterChip
                label={t('fittings.mastery.hideCompleted')}
                selected={hideCompleted}
                onToggle={() => setHideCompleted((v) => !v)}
              />
            </div>
            {untrained.length > 0 && (
              <ImplantsAssumedNote hint={t('plans.assumesNoImplantsHint')} />
            )}
            {visible.length === 0 ? (
              <p className="text-xs text-text-dim">{t('fittings.mastery.empty')}</p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                {visible.map((row) => {
                  const planned = isEntryCovered(planEntries, row.skillTypeID, row.targetLevel);
                  return (
                    <div
                      key={row.skillTypeID}
                      className="border-b border-line py-1.5 last:border-b-0"
                    >
                      <SkillRow
                        name={row.name}
                        status={row.status}
                        currentLevel={row.currentLevel}
                        timeLabel={
                          row.status === 'trained'
                            ? t('skills.fitCheck.trained')
                            : formatDuration(row.seconds)
                        }
                        addLabel={t('skills.fitCheck.add')}
                        inPlanLabel={planned ? t('skills.fitCheck.inPlan') : undefined}
                        onAdd={
                          planned
                            ? undefined
                            : () =>
                                void add([
                                  { skillTypeID: row.skillTypeID, targetLevel: row.targetLevel },
                                ])
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-text-dim">{t('fittings.mastery.suggestedNote')}</p>
            {target.plans !== undefined && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {untrained.length > 0 && (
                  <span className="text-xs text-text-dim">
                    {t('fittings.mastery.total', { time: formatDuration(totalSeconds) })}
                  </span>
                )}
                <TargetPlanPicker target={target} />
                {untrained.length > 0 && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      void add(
                        untrained.map((row) => ({
                          skillTypeID: row.skillTypeID,
                          targetLevel: row.targetLevel,
                        }))
                      )
                    }
                  >
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
      {added && (
        <Toast
          message={t('skills.fitCheck.addedToast', {
            count: added.entries.length,
            plan: added.planName,
          })}
          undo={{
            label: t('skills.fitCheck.addedToastUndo'),
            onUndo: () => {
              void target.removeEntries(added.planId, added.entries);
              setAdded(null);
            },
          }}
        />
      )}
    </>
  );
}
