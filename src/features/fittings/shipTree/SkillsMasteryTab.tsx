/**
 * Ship Info › Skills & Mastery: what flying the hull takes, then its
 * Mastery tiers I–V as in game — a button per tier, checked once trained,
 * V in gold — each listing that tier's skills, its own training time, and
 * whether it's already in the target Skill Plan. "Add tier N to plan" puts
 * everything still untrained and unplanned for tiers I..N into the target
 * Skill Plan, and shows the total time to train everything the tier still
 * needs, planned or not — once every such skill is already planned, the
 * button gives way to an "In plan" label instead of no-op'ing.
 * "Show missing" hides what's already trained, in both lists; it sticks.
 * No active Character: names and levels only, nothing to add, no time.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip } from '@/components/ui';
import { Done } from '@/components/ui/icons';
import { romanLevel } from '@/engine/projection';
import type { PlanEntry } from '@/engine/types';
import { RequiredSkillsSection } from '@/features/market/RequiredSkillsSection';
import { isEntryCovered, plannedLevelFor } from '@/features/skills/planner/reorder';
import { scheduleEntries } from '@/features/skills/ships/scheduleEntries';
import { SkillRow } from '@/features/skills/SkillRow';
import { openSkillDetailModal } from '@/stores/skillDetailModal';
import { skillTrainingStatus } from '@/features/skills/skillStatus';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import { targetPlanEntries, type TargetPlan } from '@/features/skills/useTargetPlan';
import { formatDuration } from '@/lib/duration';
import { cx } from '@/lib/cx';
import type { ShipTreeShip } from '@/sde/types';
import {
  masteryTierEntries,
  tierComplete,
  tierPlanned,
  unplannedTierEntries,
} from './shipTreeModel';
import { useShipInfoShowMissing } from './shipTreeViewPreference';
import type { ShipTreeSource } from './useShipTreeData';

const TIERS = [1, 2, 3, 4, 5] as const;

/** What one Add put into which plan — the Undo toast's payload. */
export interface AddedToPlan {
  planId: string;
  planName: string;
  entries: readonly PlanEntry[];
}
const heading = 'text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase';

export function SkillsMasteryTab({
  ship,
  source,
  target,
  onAdded,
}: {
  ship: ShipTreeShip;
  source: ShipTreeSource;
  target: TargetPlan;
  onAdded: (added: AddedToPlan) => void;
}) {
  const { t } = useTranslation();
  const { characterId, trainedSkills, trainedLevel, skillName } = source;
  const hasCharacter = characterId !== null;
  const mastery = source.statuses.get(ship.typeID)?.mastery ?? 0;
  const tiers = source.masteries[String(ship.typeID)];
  const planEntries = useMemo(() => targetPlanEntries(target), [target]);
  const [tier, setTier] = useState(() => Math.min(5, mastery + 1));
  const storedShowMissing = useShipInfoShowMissing((state) => state.value);
  const setShowMissing = useShipInfoShowMissing((state) => state.setValue);
  const hydrateShowMissing = useShipInfoShowMissing((state) => state.hydrate);
  useEffect(() => {
    void hydrateShowMissing();
  }, [hydrateShowMissing]);
  // Without a Character nothing is trained, so there is nothing to hide.
  const showMissing = hasCharacter && storedShowMissing;
  const missing = (p: { skillTypeID: number; level: number }) =>
    trainedLevel(p.skillTypeID) < p.level;

  const skillNames = useMemo(() => {
    const names: Record<number, string> = {};
    for (const r of ship.required) names[r.skillTypeID] = skillName(r.skillTypeID);
    return names;
  }, [ship, skillName]);

  const hasTiers = !!tiers && tiers.some((bundle) => bundle.length > 0);
  // Level 0: CCP lists the skill under the tier but asks for nothing yet.
  const tierBundle = (tiers?.[tier - 1] ?? []).filter((p) => p.level > 0);
  const tierSkills = showMissing ? tierBundle.filter(missing) : tierBundle;
  const requiredSkills = showMissing ? ship.required.filter(missing) : ship.required;
  // Everything still untrained through this tier, whether or not it's
  // already in the plan — this is what "time to finish the tier" costs.
  const toAdd = useMemo(
    () => (hasTiers ? masteryTierEntries(tiers, tier, trainedLevel) : []),
    [hasTiers, tiers, tier, trainedLevel]
  );
  // The subset of `toAdd` an "Add tier" click would actually add.
  const unplanned = useMemo(
    () => (hasTiers ? unplannedTierEntries(tiers, tier, trainedLevel, planEntries) : []),
    [hasTiers, tiers, tier, trainedLevel, planEntries]
  );

  // Shared by both schedule calls below, so the six-field context — and the
  // deps array that goes with it — exists in one place, not two.
  const scheduleCtx = useMemo(
    () =>
      hasCharacter
        ? {
            skills: source.catalog.engineSkills,
            trainedSkills,
            attributes: source.attributes,
            implants: source.implants,
            cloneState: source.cloneState,
          }
        : null,
    [
      hasCharacter,
      source.catalog,
      trainedSkills,
      source.attributes,
      source.implants,
      source.cloneState,
    ]
  );

  const tierSeconds = useMemo(() => {
    if (!scheduleCtx || tierBundle.length === 0) return new Map<number, number>();
    const entries = tierBundle.map((p) => ({ skillTypeID: p.skillTypeID, targetLevel: p.level }));
    const scheduled = scheduleEntries(entries, scheduleCtx);
    const seconds = new Map<number, number>();
    for (const step of scheduled) {
      seconds.set(step.skillTypeID, (seconds.get(step.skillTypeID) ?? 0) + step.seconds);
    }
    return seconds;
  }, [scheduleCtx, tierBundle]);

  const tierTotalSeconds = useMemo(() => {
    if (!scheduleCtx || toAdd.length === 0) return 0;
    const scheduled = scheduleEntries(toAdd, scheduleCtx);
    return scheduled.reduce((sum, step) => sum + step.seconds, 0);
  }, [scheduleCtx, toAdd]);

  async function addTier() {
    const result = await target.addEntries(unplanned, ship.name);
    if (result.added.length === 0) return;
    onAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }

  return (
    <div className="space-y-4 text-xs">
      {hasCharacter && (
        <div className="flex justify-end">
          <FilterChip
            label={t('ships.info.skills.showMissing')}
            selected={showMissing}
            onToggle={() => void setShowMissing(!showMissing)}
          />
        </div>
      )}
      {showMissing && requiredSkills.length === 0 && ship.required.length > 0 && (
        <p className="text-text-dim">{t('ships.info.skills.requiredAllTrained')}</p>
      )}
      <RequiredSkillsSection
        requiredSkills={requiredSkills}
        skillNames={skillNames}
        trainedSkills={trainedSkills}
        target={target}
        hasCharacter={hasCharacter}
        itemName={ship.name}
      />
      <section className="space-y-2">
        <div className="flex items-center justify-between border-b border-line pb-1">
          <h3 className={heading}>{t('ships.info.skills.masteryTitle')}</h3>
          {hasCharacter && (
            <span className="text-text">
              {mastery
                ? t('ships.info.skills.masteryLevel', { level: romanLevel(mastery) })
                : t('ships.info.skills.masteryLevelNone')}
            </span>
          )}
        </div>
        {!hasTiers ? (
          <p className="text-text-dim">{t('ships.info.skills.noMasteries')}</p>
        ) : (
          <>
            <div role="group" aria-label={t('ships.info.skills.tiersLabel')} className="flex gap-1">
              {TIERS.map((n) => {
                const complete = hasCharacter && tierComplete(tiers[n - 1], trainedLevel);
                const planned =
                  hasCharacter && !complete && tierPlanned(tiers[n - 1], trainedLevel, planEntries);
                const ariaKey = complete
                  ? 'ships.info.skills.tierComplete'
                  : planned
                    ? 'ships.info.skills.tierPlanned'
                    : 'ships.info.skills.tier';
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={tier === n}
                    aria-label={t(ariaKey, { tier: romanLevel(n) })}
                    onClick={() => setTier(n)}
                    className={cx(
                      'flex h-9 min-w-12 items-center justify-center gap-1 rounded-xs border px-2 font-bold',
                      tier === n
                        ? 'border-accent bg-accent/10'
                        : 'border-line hover:border-line-bright',
                      n === 5 ? 'text-mastery-elite' : tier === n ? 'text-accent' : 'text-text-dim'
                    )}
                  >
                    {complete && <Done size={12} aria-hidden="true" />}
                    {planned && (
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent-dim" />
                    )}
                    {romanLevel(n)}
                  </button>
                );
              })}
            </div>
            {tierSkills.length === 0 ? (
              <p className="text-text-dim">
                {t(
                  tierBundle.length > 0
                    ? 'ships.info.skills.tierAllTrained'
                    : 'ships.info.skills.tierEmpty'
                )}
              </p>
            ) : (
              <ul className="space-y-1">
                {tierSkills.map((p) => {
                  const have = trainedLevel(p.skillTypeID);
                  const status = skillTrainingStatus(have, p.level);
                  const planned = isEntryCovered(planEntries, p.skillTypeID, p.level);
                  return (
                    <li key={p.skillTypeID}>
                      {hasCharacter ? (
                        <SkillRow
                          name={`${skillName(p.skillTypeID)} ${romanLevel(p.level)}`}
                          skillTypeID={p.skillTypeID}
                          status={status}
                          currentLevel={have}
                          timeLabel={
                            status === 'trained'
                              ? t('skills.fitCheck.trained')
                              : formatDuration(tierSeconds.get(p.skillTypeID) ?? 0)
                          }
                          inPlanLabel={planned ? t('skills.fitCheck.inPlan') : undefined}
                          plannedLevel={plannedLevelFor(planEntries, p.skillTypeID)}
                        />
                      ) : (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openSkillDetailModal(p.skillTypeID)}
                            className="flex-1 text-left text-text hover:underline"
                          >
                            {skillName(p.skillTypeID)}
                          </button>
                          <span className="text-text-dim">
                            {t('plans.level', { level: p.level })}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {hasCharacter && target.plans !== undefined && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {toAdd.length > 0 && tierTotalSeconds > 0 && (
                  <span className="text-text-dim">
                    {t('ships.info.skills.tierTotalTime', {
                      time: formatDuration(tierTotalSeconds),
                    })}
                  </span>
                )}
                <TargetPlanPicker target={target} />
                {toAdd.length === 0 ? (
                  <span className="text-text-dim">{t('ships.info.skills.tierTrained')}</span>
                ) : unplanned.length === 0 ? (
                  <span className="text-text-dim">{t('ships.info.skills.tierInPlan')}</span>
                ) : (
                  <Button size="sm" onClick={() => void addTier()}>
                    {t('ships.info.skills.addTier', { tier: romanLevel(tier) })}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
