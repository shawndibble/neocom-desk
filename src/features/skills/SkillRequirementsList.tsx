import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui';
import type { PlanEntry } from '@/engine/types';
import { ItemInfoLink, SkillLink } from '@/features/entities';
import type { PrereqRow, UnlockRow } from './skillRequirements';
import { groupUnlocksByLevel, type ItemUnlockRow, type UnlockLevel } from './skillUnlockLevels';
import { DividedList } from '@/components/ui/DividedList';

const EXPAND_ALL_UNLOCKS_AT_MOST = 12;

interface SkillRequirementsListProps {
  skillTypeID: number;
  prereqs: readonly PrereqRow[];
  unlocks: readonly UnlockRow[];
  itemUnlocks?: readonly ItemUnlockRow[];
  trainedLevel?: number;
  className?: string;
  planEntries?: readonly PlanEntry[];
}

interface RequirementRowProps {
  typeID: number;
  name: string;
  trailing: ReactNode;
  planEntries?: readonly PlanEntry[];
}

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
    <DividedList surface="none" className="mt-1">
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
    </DividedList>
  );
}

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
