/**
 * The stats heading's "whose skills" line: the Character and the skills the
 * stats are really worked out under — its own, All V or All 0 from the
 * Skills control, plus how many single skills are set on top. With no
 * Character the pilot is All V (unless the control says All 0).
 */
import { useTranslation } from 'react-i18next';
import { useSkillOverrides } from './statsConditions';

export function StatsHeadingLabel({
  hasCharacter,
  characterName,
}: {
  hasCharacter: boolean;
  /** Null while it loads — nothing is said until it has. */
  characterName: string | null;
}) {
  const { t } = useTranslation();
  const skills = useSkillOverrides((state) => state.skills);
  if (hasCharacter && characterName === null) return null;
  const base = hasCharacter ? skills.base : skills.base === 'all0' ? 'all0' : 'allV';
  const heading = hasCharacter
    ? t(`fittings.stats.headingCharacter.${base}`, { name: characterName })
    : t(`fittings.stats.headingNoCharacter.${base}`);
  const set = Object.keys(skills.levels).length;
  return (
    <>
      {heading}
      {set > 0 && ` · ${t('fittings.stats.headingSkillsSet', { count: set })}`}
    </>
  );
}
