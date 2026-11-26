import { useTranslation } from 'react-i18next';
import { Tooltip } from './Tooltip';
import { standingTier, type StandingTier } from './standingTier';

const TIER_FILL: Record<StandingTier, string> = {
  terrible: '#8c0604',
  bad: '#ac3e04',
  neutral: '#7c7e7c',
  good: '#245aac',
  excellent: '#04226c',
};

const TIER_GLYPH: Record<StandingTier, readonly (readonly [number, number, number, number])[]> = {
  terrible: [[1, 4, 7, 1]],
  bad: [[2, 4, 5, 1]],
  neutral: [
    [2, 3, 5, 1],
    [2, 5, 5, 1],
  ],
  good: [
    [2, 4, 5, 1],
    [4, 2, 1, 5],
  ],
  excellent: [
    [1, 4, 7, 1],
    [4, 1, 1, 7],
  ],
};

interface StandingIconProps {
  value: number;
  label?: string;
  className?: string;
}

export function StandingIcon({ value, label, className = '' }: StandingIconProps) {
  const { t } = useTranslation();
  const clamped = Math.max(-10, Math.min(10, value));
  const tier = standingTier(clamped);
  const resolvedLabel =
    label ??
    t('contacts.standingTierValue', {
      tier: t(`contacts.tier.${tier}`),
      value: clamped,
    });
  return (
    <Tooltip content={resolvedLabel} openOnTap>
      <span
        role="img"
        aria-label={resolvedLabel}
        tabIndex={0}
        className={`inline-flex shrink-0 focus-visible:outline-2 focus-visible:outline-accent ${className}`}
      >
        <svg
          viewBox="0 0 9 9"
          width="1rem"
          height="1rem"
          shapeRendering="crispEdges"
          aria-hidden="true"
        >
          <rect width="9" height="9" fill={TIER_FILL[tier]} />
          {TIER_GLYPH[tier].map(([x, y, width, height]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width={width} height={height} fill="#fcfefc" />
          ))}
        </svg>
      </span>
    </Tooltip>
  );
}
