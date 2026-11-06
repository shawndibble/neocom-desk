import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui';
import type { PlanEntry } from '@/engine/types';
import { ItemInfoLink, SkillLink } from '@/features/entities';
import type { PrereqRow, UnlockRow } from './skillRequirements';
import { groupUnlocksByLevel, type ItemUnlockRow, type UnlockLevel } from './skillUnlockLevels';

/** At or under this many unlocks in all, every level starts expanded; over it, the levels start as a summary to open. */
const EXPAND_ALL_UNLOCKS_AT_MOST = 12;

interface SkillRequirementsListProps {
  /** The skill these rows belong to: a different skill starts the per-level list from its own default expansion. */
  skillTypeID: number;
  prereqs: readonly PrereqRow[];
  unlocks: readonly UnlockRow[];
  /** Ships, modules and other items the skill unlocks, listed with the skills under each level. */
  itemUnlocks?: readonly ItemUnlockRow[];
  /** The character's trained level of this skill, so the levels it has reached read "Trained". */
  trainedLevel?: number;
  className?: string;
  /**
   * Carried into a nested `SkillLink` so drilling into a
   * prereq/unlock's own detail keeps reading the same open plan's entries —
   * otherwise a skill two levels deep would lose "Planned" and fall back to
   * "Level needed" the instant its own detail opened.
   */
  planEntries?: readonly PlanEntry[];
}

interface RequirementRowProps {
  typeID: number;
  name: string;
  trailing: ReactNode;
  planEntries?: readonly PlanEntry[];
}

/**
 * Name opens the shared Skill Detail popover (#400/#405) rather than
 * navigating away — same target `SkillDetailModal` already reachable from a
 * skill row, so a prereq/unlock two levels deep in another skill's detail
 * re-targets the same popover instead of opening a second one.
 */
function RequirementRow({ typeID, name, trailing, planEntries }: RequirementRowProps) {
  return (
    <li className="flex items-center justify-between gap-2 py-1 text-xs">
      <SkillLink typeId={typeID} planEntries={planEntries} className="truncate">
        {name}
      </SkillLink>
      {trailing}
    </li>
  );
}

interface UnlockLevelsProps {
  levels: readonly UnlockLevel[];
  trainedLevel: number;
  planEntries?: readonly PlanEntry[];
}

/**
 * What each level unlocks, one disclosure per level: the summary ("2 skills ·
 * 3 ships") in the row, the named skills and items beneath. A skill name opens
 * its Skill Detail, an item name its Item Detail.
 */
function UnlockLevels({ levels, trainedLevel, planEntries }: UnlockLevelsProps) {
  const { t } = useTranslation();
  const total = levels.reduce((n, l) => n + l.count, 0);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(
    () => new Set(total <= EXPAND_ALL_UNLOCKS_AT_MOST ? levels.map((l) => l.level) : [])
  );
  const toggle = (level: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });

  return (
    <div className="mt-1 divide-y divide-line rounded-xs border border-line">
      {levels.map(({ level, groups }) => (
        <Disclosure
          key={level}
          label={
            level <= trainedLevel
              ? t('skills.inspector.unlockLevelTrained', { level })
              : t('skills.inspector.levelNeeded', { level })
          }
          trailing={groups
            .map((g) => t(`skills.inspector.unlockKind.${g.kind}`, { count: g.rows.length }))
            .join(' · ')}
          expanded={expanded.has(level)}
          onToggle={() => toggle(level)}
        >
          {groups.map((group) => (
            <section key={group.kind} className="px-2.5 py-1.5">
              <h4 className="text-[0.6875rem] text-text-dim">
                {t(`skills.inspector.unlockKind.${group.kind}`, { count: group.rows.length })}
              </h4>
              <ul>
                {group.rows.map((row) => (
                  <li key={row.typeID} className="truncate py-0.5 text-xs">
                    {group.kind === 'skill' ? (
                      <SkillLink typeId={row.typeID} planEntries={planEntries}>
                        {row.name}
                      </SkillLink>
                    ) : (
                      <ItemInfoLink typeId={row.typeID}>{row.name}</ItemInfoLink>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </Disclosure>
      ))}
    </div>
  );
}

/** A skill's prerequisites (trained vs. still needed) and what each of its levels unlocks. No chrome of its own. */
export function SkillRequirementsList({
  skillTypeID,
  prereqs,
  unlocks,
  itemUnlocks = [],
  trainedLevel = 0,
  className = '',
  planEntries,
}: SkillRequirementsListProps) {
  const { t } = useTranslation();
  const unlockLevels = groupUnlocksByLevel(unlocks, itemUnlocks);
  return (
    <div className={`space-y-3 ${className}`}>
      <section>
        <h3 className={eyebrowClassName}>{t('skills.inspector.prereqsTitle')}</h3>
        {prereqs.length === 0 ? (
          <p className="mt-1 text-xs text-text-dim">{t('skills.inspector.noPrereqs')}</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {prereqs.map((req) => (
              <RequirementRow
                key={req.typeID}
                typeID={req.typeID}
                name={req.name}
                planEntries={planEntries}
                trailing={
                  <span
                    data-trained={req.trained}
                    data-planned={req.planned}
                    className={`shrink-0 rounded-xs px-1.5 py-0.5 text-[0.6875rem] uppercase tracking-widest ${
                      req.trained
                        ? 'bg-accent/20 text-accent'
                        : req.planned
                          ? 'text-accent'
                          : 'text-text-dim'
                    }`}
                  >
                    {req.trained
                      ? t('skills.inspector.trained', { level: req.level })
                      : req.planned
                        ? t('skills.inspector.planned', { level: req.level })
                        : t('skills.inspector.levelNeeded', { level: req.level })}
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className={eyebrowClassName}>{t('skills.inspector.unlocksTitle')}</h3>
        {unlockLevels.length === 0 ? (
          <p className="mt-1 text-xs text-text-dim">{t('skills.inspector.noUnlocks')}</p>
        ) : (
          <UnlockLevels
            // Another skill, or its items arriving, starts from its own default expansion.
            key={`${skillTypeID}:${itemUnlocks.length}`}
            levels={unlockLevels}
            trainedLevel={trainedLevel}
            planEntries={planEntries}
          />
        )}
      </section>
    </div>
  );
}
