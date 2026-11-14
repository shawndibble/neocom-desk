import { useTranslation } from 'react-i18next';

/** 5-segment skill level indicator: filled accent = trained, accent outline = planned, gray fill = needed, hairline = untrained. */
interface SkillBarProps {
  level: number;
  /**
   * Fraction (0..1) of the segment just past `level` already banked toward
   * that next level. Omit (or `null`, e.g. at level 5) to render that
   * segment as plain untrained hairline — a discrete pip per level hides
   * that a skill might be most of the way to its next one (#405).
   */
  progress?: number | null;
  /**
   * The highest level a Skill Plan already targets, past `level`. Segments
   * from `level + 1` through this one render as a distinct outline rather
   * than plain hairline, so a skill already queued in the plan doesn't look
   * identical to one that isn't (issue: "Add tier V" looked actionable for a
   * skill already in the plan, with no way to tell from the bar itself).
   * Omit, or `null`, when nothing is planned past what's trained.
   */
  plannedLevel?: number | null;
  /**
   * The level something (a ship, a fit, a prerequisite) needs. Segments past
   * `level` up to this one, and not already planned, fill gray, so an
   * untrained requirement shows how far it goes instead of five empty pips.
   * Omit, or `null`, where nothing asks for a level.
   */
  requiredLevel?: number | null;
  className?: string;
}

const LEVELS = [1, 2, 3, 4, 5] as const;

export function SkillBar({
  level,
  progress,
  plannedLevel,
  requiredLevel,
  className = '',
}: SkillBarProps) {
  const { t } = useTranslation();
  const planned = plannedLevel != null && plannedLevel > level ? plannedLevel : null;
  const needed = requiredLevel != null && requiredLevel > level ? requiredLevel : null;
  const ariaLabel =
    planned !== null && needed !== null
      ? t('skills.levelOfFivePlannedNeeded', { level, planned, needed })
      : planned !== null
        ? t('skills.levelOfFivePlanned', { level, planned })
        : needed !== null
          ? t('skills.levelOfFiveNeeded', { level, needed })
          : t('skills.levelOfFive', { level });
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 ${className}`}
    >
      {LEVELS.map((segment) => {
        const trained = segment <= level;
        const inPlan = !trained && planned !== null && segment <= planned;
        const required = !trained && !inPlan && needed !== null && segment <= needed;
        const partial = !trained && !inPlan && segment === level + 1 && progress != null;
        return (
          <span
            key={segment}
            aria-hidden="true"
            className={`relative h-2.5 w-1.5 overflow-hidden rounded-[1px] ${
              trained
                ? 'bg-accent'
                : inPlan
                  ? 'border border-accent-dim bg-accent-dim/40'
                  : required
                    ? 'border border-text-dim bg-text-dim'
                    : 'border border-line bg-transparent'
            }`}
          >
            {partial && (
              <span
                className="absolute inset-y-0 left-0 bg-accent/50"
                style={{ width: `${progress * 100}%` }}
              />
            )}
          </span>
        );
      })}
    </span>
  );
}
