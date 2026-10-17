/**
 * Whose skills the stats are worked out under: the Character and the skills
 * really used — its own, All V or All 0 from the Skills control, plus how
 * many single skills are set on top. With no Character the pilot is All V
 * (unless the control says All 0). `short` is the Pilot trigger's form (just
 * the name for own skills); the long one is the Pilot panel's subtitle.
 */
import { useTranslation } from 'react-i18next';
import { useSkillOverrides } from './statsConditions';

export function StatsHeadingLabel({
  hasCharacter,
  characterName,
  short = false,
}: {
  hasCharacter: boolean;
  /** Null while it loads — nothing is said until it has. */
  characterName: string | null;
  short?: boolean;
}) {
  const { t } = useTranslation();
  const skills = useSkillOverrides((state) => state.skills);
  if (hasCharacter && characterName === null) return null;
  const base = hasCharacter ? skills.base : skills.base === 'all0' ? 'all0' : 'allV';
  const heading = hasCharacter
    ? t(`fittings.stats.${short ? 'headingCharacterShort' : 'headingCharacter'}.${base}`, {
        name: characterName,
      })
    : t(`fittings.stats.headingNoCharacter.${base}`);
  const set = Object.keys(skills.levels).length;
  const setKey = short ? 'fittings.stats.headingSkillsSetShort' : 'fittings.stats.headingSkillsSet';
  return (
    <>
      {heading}
      {set > 0 && ` · ${t(setKey, { count: set })}`}
    </>
  );
}
