import { useTranslation } from 'react-i18next';

/** Standing (-10..10) as a center-anchored bar: fill grows from the middle, and its side (not just its color) carries the sign. */
interface StandingBarProps {
  value: number;
  className?: string;
}

export function StandingBar({ value, className = '' }: StandingBarProps) {
  const { t } = useTranslation();
  const clamped = Math.max(-10, Math.min(10, value));
  const magnitude = (Math.abs(clamped) / 10) * 50;
  const tone = clamped > 0 ? 'bg-success' : clamped < 0 ? 'bg-danger' : 'bg-text-dim';
  return (
    <span
      role="img"
      aria-label={t('contacts.standingValue', { value: clamped })}
      className={`relative inline-block h-2.5 w-12 rounded-[1px] bg-panel-2 ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line"
      />
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 ${clamped >= 0 ? 'left-1/2' : 'right-1/2'} ${tone}`}
        style={{ width: `${magnitude}%` }}
      />
    </span>
  );
}
