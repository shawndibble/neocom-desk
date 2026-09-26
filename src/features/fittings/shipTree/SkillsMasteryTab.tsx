/**
 * Ship Info › Skills & Mastery: what flying the hull takes, then its
 * Mastery tiers I–V as in game — a button per tier, checked once trained,
 * V in gold — each listing that tier's skills. "Add tier N to plan" puts
 * everything still untrained for tiers I..N into the target Skill Plan.
 * No active Character: names and levels only, nothing to add.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { Done } from '@/components/ui/icons';
import { romanLevel } from '@/engine/projection';
import type { PlanEntry } from '@/engine/types';
import { RequiredSkillsSection } from '@/features/market/RequiredSkillsSection';
import { SkillRow } from '@/features/skills/SkillRow';
import { skillTrainingStatus } from '@/features/skills/skillStatus';
import { TargetPlanPicker } from '@/features/skills/TargetPlanPicker';
import type { TargetPlan } from '@/features/skills/useTargetPlan';
import { cx } from '@/lib/cx';
import type { ShipTreeShip } from '@/sde/types';
import { masteryTierEntries, tierComplete } from './shipTreeModel';
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
  const [tier, setTier] = useState(() => Math.min(5, mastery + 1));

  const skillNames = useMemo(() => {
    const names: Record<number, string> = {};
    for (const r of ship.required) names[r.skillTypeID] = skillName(r.skillTypeID);
    return names;
  }, [ship, skillName]);

  const hasTiers = !!tiers && tiers.some((bundle) => bundle.length > 0);
  const tierSkills = tiers?.[tier - 1] ?? [];
  const toAdd = hasTiers ? masteryTierEntries(tiers, tier, trainedLevel) : [];

  async function addTier() {
    const result = await target.addEntries(toAdd, ship.name);
    if (result.added.length === 0) return;
    onAdded({ planId: result.planId, planName: result.planName, entries: result.added });
  }

  return (
    <div className="space-y-4 text-xs">
      <RequiredSkillsSection
        requiredSkills={ship.required}
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
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={tier === n}
                    aria-label={t(
                      complete ? 'ships.info.skills.tierComplete' : 'ships.info.skills.tier',
                      { tier: romanLevel(n) }
                    )}
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
                    {romanLevel(n)}
                  </button>
                );
              })}
            </div>
            {tierSkills.length === 0 ? (
              <p className="text-text-dim">{t('ships.info.skills.tierEmpty')}</p>
            ) : (
              <ul className="space-y-1">
                {tierSkills.map((p) => {
                  const have = trainedLevel(p.skillTypeID);
                  return (
                    <li key={p.skillTypeID}>
                      {hasCharacter ? (
                        <SkillRow
                          name={`${skillName(p.skillTypeID)} ${romanLevel(p.level)}`}
                          status={skillTrainingStatus(have, p.level)}
                          currentLevel={have}
                        />
                      ) : (
                        <div className="flex items-center gap-3">
                          <span className="flex-1 text-text">{skillName(p.skillTypeID)}</span>
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
                <TargetPlanPicker target={target} />
                {toAdd.length > 0 ? (
                  <Button size="sm" onClick={() => void addTier()}>
                    {t('ships.info.skills.addTier', { tier: romanLevel(tier) })}
                  </Button>
                ) : (
                  <span className="text-text-dim">{t('ships.info.skills.tierTrained')}</span>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
