import { useTranslation } from 'react-i18next';

/** 5-segment skill level indicator: filled accent squares = trained, hairline = untrained. */
interface SkillBarProps {
  level: number;
  /**
   * Fraction (0..1) of the segment just past `level` already banked toward
   * that next level. Omit (or `null`, e.g. at level 5) to render that
   * segment as plain untrained hairline — a discrete pip per level hides
   * that a skill might be most of the way to its next one (#405).
   */
  progress?: number | null;
  className?: string;
}

const LEVELS = [1, 2, 3, 4, 5] as const;

export function SkillBar({ level, progress, className = '' }: SkillBarProps) {
  const { t } = useTranslation();
  return (
    <span
      role="img"
      aria-label={t('skills.levelOfFive', { level })}
      className={`inline-flex items-center gap-0.5 ${className}`}
    >
      {LEVELS.map((segment) => {
        const trained = segment <= level;
        const partial = !trained && segment === level + 1 && progress != null;
        return (
          <span
            key={segment}
            aria-hidden="true"
            className={`relative h-2.5 w-1.5 overflow-hidden rounded-[1px] ${
              trained ? 'bg-accent' : 'border border-line bg-transparent'
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
