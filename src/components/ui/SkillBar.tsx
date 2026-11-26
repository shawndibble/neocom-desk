import { useTranslation } from 'react-i18next';

interface SkillBarProps {
  level: number;
  progress?: number | null;
  plannedLevel?: number | null;
  requiredLevel?: number | null;
  className?: string;
}

const LEVELS = [1, 2, 3, 4, 5] as const;

type Segment = 'trained' | 'planned' | 'needed' | 'untrained';

const SEGMENT_CLASS: Record<Segment, string> = {
  trained: 'bg-accent',
  planned: 'border border-accent-dim bg-accent-dim/40',
  needed: 'border border-text-dim bg-text-dim',
  untrained: 'border border-line bg-transparent',
};

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
  const ariaKey =
    planned !== null
      ? needed !== null
        ? 'skills.levelOfFivePlannedNeeded'
        : 'skills.levelOfFivePlanned'
      : needed !== null
        ? 'skills.levelOfFiveNeeded'
        : 'skills.levelOfFive';
  const ariaLabel = t(ariaKey, { level, planned, needed });
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 ${className}`}
    >
      {LEVELS.map((segment) => {
        const state: Segment =
          segment <= level
            ? 'trained'
            : planned !== null && segment <= planned
              ? 'planned'
              : needed !== null && segment <= needed
                ? 'needed'
                : 'untrained';
        const partial =
          (state === 'untrained' || state === 'needed') &&
          segment === level + 1 &&
          progress != null;
        return (
          <span
            key={segment}
            aria-hidden="true"
            className={`relative h-2.5 w-1.5 overflow-hidden rounded-[1px] ${SEGMENT_CLASS[state]}`}
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
