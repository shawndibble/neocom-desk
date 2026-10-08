/**
 * Marks a build row whose blueprint no character on the account can install.
 * Shared by Market-Wide Build Opportunities, Build Plan detail's material rows
 * and the plan header so the surfaces never say the shortfall differently.
 * Only renders for a gated verdict — there's no positive "you can build this"
 * state.
 *
 * The chip names the missing skill. Clicking it opens a popover for the
 * closest character: each missing skill (a Skill modal link), how long it
 * takes to train, and an Add to Skill Plan button. The data hooks live in the
 * popover body, so a list of many markers loads nothing until one is opened.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { romanLevel } from '@/engine/projection';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';
import type { PlanEntry } from '@/engine/types';
import { formatCountdown } from '@/lib/duration';
import { AddToPlanBar, type AddedToPlan } from '@/features/skills/AddToPlanBar';
import { cloneStateFor, useCloneStates } from '@/features/skills/cloneState';
import { isEntryCovered } from '@/features/skills/planner/reorder';
import { usePlanEditorData } from '@/features/skills/planner/usePlanEditorData';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { SkillLink } from '@/features/entities';
import { targetPlanEntries, useTargetPlan } from '@/features/skills/useTargetPlan';

type GatedVerdict = Extract<SkillGateVerdict, { gated: true }>;

export interface SkillGateMarkerProps {
  verdict: GatedVerdict;
  nameForSkill: (typeID: number) => string;
  nameForCharacter: (characterId: number) => string;
  /** Names the Skill Plan "Add" creates when the character has none yet. */
  newPlanName?: string;
  /**
   * Icon only, no warning chip: for a gate most rows of the page share, which
   * the panel's footer rule already states. The click still opens the
   * popover, so a quiet row is no less actionable than a loud one.
   */
  quiet?: boolean;
}

export function SkillGateMarker({
  verdict,
  nameForSkill,
  nameForCharacter,
  newPlanName,
  quiet = false,
}: SkillGateMarkerProps) {
  const { t } = useTranslation();
  const { shortfall } = verdict;
  const label =
    shortfall.length === 1
      ? t('industry.skillGateMarkerSingle', {
          skill: nameForSkill(shortfall[0]!.typeID),
          level: romanLevel(shortfall[0]!.needLevel),
        })
      : t('industry.skillGateMarkerMany', { count: shortfall.length });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${t('industry.skillGateTooltipTitle')}: ${label}`}
          // A row click or a card link behind the chip must not also fire.
          onClick={(event) => event.stopPropagation()}
          className={cx(
            'inline-flex max-w-full shrink-0 items-center gap-1 rounded-xs text-left',
            quiet
              ? 'p-0.5 text-text-dim enabled:hover:text-warning'
              : 'border border-warning/60 px-1.5 py-0.5 text-warning enabled:hover:border-warning enabled:hover:bg-warning/10 enabled:active:bg-warning/20',
            interactiveClassName,
            focusRingClassName
          )}
        >
          <Icon.SkillLocked size={Icon.ICON_SIZE.sm} />
          {!quiet && <span className="min-w-0 text-[0.6875rem] leading-tight">{label}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)] p-3"
        onClick={(event) => event.stopPropagation()}
      >
        <SkillGatePopoverBody
          verdict={verdict}
          nameForSkill={nameForSkill}
          nameForCharacter={nameForCharacter}
          newPlanName={newPlanName}
        />
      </PopoverContent>
    </Popover>
  );
}

function SkillGatePopoverBody({
  verdict,
  nameForSkill,
  nameForCharacter,
  newPlanName,
}: SkillGateMarkerProps) {
  const { t } = useTranslation();
  const { shortfall, bestCharacterId } = verdict;
  const [added, setAdded] = useState<AddedToPlan | null>(null);
  const { catalog, trainedSkills, attributes, implants } = usePlanEditorData(bestCharacterId);
  const target = useTargetPlan(bestCharacterId);
  const cloneStates = useCloneStates((state) => state.value);
  const hydrateCloneStates = useCloneStates((state) => state.hydrate);
  useEffect(() => {
    void hydrateCloneStates();
  }, [hydrateCloneStates]);
  const cloneState = cloneStateFor(cloneStates, bestCharacterId);

  const entries = useMemo(
    (): PlanEntry[] => shortfall.map((s) => ({ skillTypeID: s.typeID, targetLevel: s.needLevel })),
    [shortfall]
  );
  // Prerequisites the character is missing are scheduled ahead of these
  // entries, so the total is the whole schedule, not just the entries' own.
  const scheduled = useMemo(
    () =>
      catalog
        ? scheduleEntries(entries, {
            skills: catalog.engineSkills,
            trainedSkills,
            attributes,
            implants,
            cloneState,
          })
        : null,
    [catalog, entries, trainedSkills, attributes, implants, cloneState]
  );

  const planEntries = targetPlanEntries(target);
  const unplanned = entries.filter(
    (e) => !isEntryCovered(planEntries, e.skillTypeID, e.targetLevel)
  );
  const totalSeconds = scheduled?.reduce((sum, step) => sum + step.seconds, 0) ?? null;
  const planName = newPlanName ?? t('industry.skillGatePlanName');

  async function add() {
    const result = await target.addEntries(unplanned, planName);
    if (result.added.length === 0) return;
    setAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-text">{t('industry.skillGateTooltipTitle')}</p>
      <ul className="space-y-1 text-xs">
        {shortfall.map((s) => {
          const seconds = scheduled
            ?.filter((step) => step.skillTypeID === s.typeID)
            .reduce((sum, step) => sum + step.seconds, 0);
          return (
            <li key={s.typeID} className="flex flex-wrap items-baseline gap-x-2">
              <SkillLink typeId={s.typeID}>{nameForSkill(s.typeID)}</SkillLink>
              <span className="text-text-dim tabular-nums">
                {s.haveLevel === 0 ? '—' : romanLevel(s.haveLevel)} → {romanLevel(s.needLevel)}
              </span>
              {seconds !== undefined && seconds > 0 && (
                <span className="text-text-dim">{formatCountdown(seconds)}</span>
              )}
              {isEntryCovered(planEntries, s.typeID, s.needLevel) && (
                <span className="text-accent">{t('skills.fitCheck.inPlan')}</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-text-dim">
        {totalSeconds !== null && totalSeconds > 0
          ? t('industry.skillGateBestOnTime', {
              character: nameForCharacter(bestCharacterId),
              time: formatCountdown(totalSeconds),
            })
          : t('industry.skillGateBestOn', { character: nameForCharacter(bestCharacterId) })}
      </p>
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
