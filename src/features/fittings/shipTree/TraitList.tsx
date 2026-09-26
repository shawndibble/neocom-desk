/**
 * A hull's bonuses as the game lists them: "<Skill> bonuses (per skill
 * level):" per skill, then "Role bonus:", each line's value and unit bold.
 * `tone` picks the hover card's ISIS colours or the app's own.
 */
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import type { ShipTreeTrait } from '@/sde/types';
import { traitGroups } from './shipTreeModel';

export function TraitList({
  traits,
  skillName,
  tone,
}: {
  traits: readonly ShipTreeTrait[];
  skillName: (skillTypeID: number) => string;
  tone: 'isis' | 'app';
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      {traitGroups(traits).map((group) => (
        <div key={group.skillTypeID ?? 'role'}>
          <div
            className={cx('font-semibold', tone === 'isis' ? 'isis-trait-skill' : 'text-text-dim')}
          >
            {group.skillTypeID === null
              ? t('ships.info.bonuses.role')
              : t('ships.info.bonuses.skill', { skill: skillName(group.skillTypeID) })}
          </div>
          {group.traits.map((trait, i) => (
            <div key={i} className="flex gap-2 pl-2">
              <span
                className={cx(
                  'w-10 shrink-0 text-right font-semibold tabular-nums',
                  tone === 'isis' ? 'isis-trait-value' : 'text-text'
                )}
              >
                {trait.bonus !== null ? `${trait.bonus}${trait.unit}` : '·'}
              </span>
              <span>{trait.text}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
