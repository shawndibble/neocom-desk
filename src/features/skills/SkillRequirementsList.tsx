import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { openSkillDetailModal } from '@/stores/skillDetailModal';
import type { PrereqRow, UnlockRow } from './skillRequirements';

interface SkillRequirementsListProps {
  prereqs: readonly PrereqRow[];
  unlocks: readonly UnlockRow[];
  className?: string;
}

interface RequirementRowProps {
  typeID: number;
  name: string;
  muted?: boolean;
  trailing: ReactNode;
}

/**
 * Name opens the shared Skill Detail popover (#400/#405) rather than
 * navigating away — same target `SkillDetailModal` already reachable from a
 * skill row, so a prereq/unlock two levels deep in another skill's detail
 * re-targets the same popover instead of opening a second one.
 */
function RequirementRow({ typeID, name, muted = false, trailing }: RequirementRowProps) {
  return (
    <li className="flex items-center justify-between gap-2 py-1 text-xs">
      <button
        type="button"
        onClick={() => openSkillDetailModal(typeID)}
        className={`truncate text-left hover:underline ${muted ? 'text-text-dim' : 'text-text'}`}
      >
        {name}
      </button>
      {trailing}
    </li>
  );
}

/** A skill's prerequisites (trained vs. still needed) and what it unlocks. No chrome of its own. */
export function SkillRequirementsList({
  prereqs,
  unlocks,
  className = '',
}: SkillRequirementsListProps) {
  const { t } = useTranslation();
  return (
    <div className={`space-y-3 ${className}`}>
      <section>
        <h3 className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">
          {t('skills.inspector.prereqsTitle')}
        </h3>
        {prereqs.length === 0 ? (
          <p className="mt-1 text-xs text-text-dim">{t('skills.inspector.noPrereqs')}</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {prereqs.map((req) => (
              <RequirementRow
                key={req.typeID}
                typeID={req.typeID}
                name={req.name}
                muted={!req.trained}
                trailing={
                  <span
                    data-trained={req.trained}
                    className={`shrink-0 rounded-xs px-1.5 py-0.5 text-[11px] uppercase tracking-wide ${
                      req.trained ? 'bg-accent/20 text-accent' : 'border border-line text-text-dim'
                    }`}
                  >
                    {req.trained
                      ? t('skills.inspector.trained', { level: req.level })
                      : t('skills.inspector.levelNeeded', { level: req.level })}
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-[11px] font-semibold tracking-widest text-text-dim uppercase">
          {t('skills.inspector.unlocksTitle')}
        </h3>
        {unlocks.length === 0 ? (
          <p className="mt-1 text-xs text-text-dim">{t('skills.inspector.noUnlocks')}</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {unlocks.map((req) => (
              <RequirementRow
                key={req.typeID}
                typeID={req.typeID}
                name={req.name}
                trailing={
                  <span className="shrink-0 text-text-dim">
                    {t('skills.inspector.levelNeeded', { level: req.level })}
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
