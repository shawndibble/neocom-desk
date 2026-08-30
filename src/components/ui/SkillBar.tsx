import { useTranslation } from 'react-i18next';

/** 5-segment skill level indicator: filled accent squares = trained, hairline = untrained. */
interface SkillBarProps {
  level: number;
  className?: string;
}

const LEVELS = [1, 2, 3, 4, 5] as const;

export function SkillBar({ level, className = '' }: SkillBarProps) {
  const { t } = useTranslation();
  return (
    <span
      role="img"
      aria-label={t('skills.levelOfFive', { level })}
      className={`inline-flex items-center gap-0.5 ${className}`}
    >
      {LEVELS.map((segment) => (
        <span
          key={segment}
          aria-hidden="true"
          className={`h-2.5 w-1.5 rounded-[1px] ${
            segment <= level ? 'bg-accent' : 'border border-line bg-transparent'
          }`}
        />
      ))}
    </span>
  );
}
