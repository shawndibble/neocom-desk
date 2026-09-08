import { useTranslation } from 'react-i18next';
import { Tooltip } from './Tooltip';
import { standingTier, type StandingTier } from './standingTier';

/**
 * EVE's own colour-tag palette, sampled from the 9×9 client icons (the
 * `ColorTag-*9.gif` set the UniWiki mirrors) — the mid-tone of each icon's
 * vertical gradient. Deliberately literal hex rather than a design token:
 * these are the game's colours, and a pilot recognises this exact red and
 * this exact blue from the overview. Note that EXCELLENT is the *darker*
 * blue and GOOD the lighter one, which is the game's choice, not a slip.
 */
const TIER_FILL: Record<StandingTier, string> = {
  terrible: '#8c0604',
  bad: '#ac3e04',
  neutral: '#7c7e7c',
  good: '#245aac',
  excellent: '#04226c',
};

/**
 * The white glyph inside the square, on the same 9×9 grid the client draws it
 * on: a minus, an equals or a plus.
 *
 * The client draws TERRIBLE and BAD with the same minus, and GOOD and
 * EXCELLENT with the same plus, leaving colour alone to separate each pair —
 * two reds and two blues. DESIGN.md §7 does not allow that, so the extremes
 * get a mark that runs the full width of the square while ±5 keeps the
 * client's shorter one. Magnitude reads as mark size, sign as the glyph, and
 * colour becomes the confirmation rather than the only channel. This is the
 * one place the tag deliberately departs from the game's own art; the mark
 * lengths below are the whole of the departure.
 */
const TIER_GLYPH: Record<StandingTier, readonly (readonly [number, number, number, number])[]> = {
  // A minus, full width.
  terrible: [[1, 4, 7, 1]],
  // A minus, the client's width.
  bad: [[2, 4, 5, 1]],
  // Two bars: equals — neither plus nor minus. Exactly as the client draws it.
  neutral: [
    [2, 3, 5, 1],
    [2, 5, 5, 1],
  ],
  // A plus, the client's width.
  good: [
    [2, 4, 5, 1],
    [4, 2, 1, 5],
  ],
  // A plus, full width.
  excellent: [
    [1, 4, 7, 1],
    [4, 1, 1, 7],
  ],
};

interface StandingIconProps {
  value: number;
  className?: string;
}

/**
 * Standing as EVE's own colour tag: a coloured square carrying a minus, an
 * equals or a plus. Colour separates the two tiers that share a glyph
 * (terrible/bad, good/excellent), which is how the client does it — so the
 * exact number never disappears: it is in the accessible name and the
 * tooltip, e.g. "Excellent standing (10)".
 *
 * `role="img"` with a tooltip rather than a focusable trigger, following
 * `NotificationsPanel`'s badge: the meaning has to reach a screen reader, but
 * a tab stop on every row of a long contact list costs more than the tag is
 * worth.
 */
export function StandingIcon({ value, className = '' }: StandingIconProps) {
  const { t } = useTranslation();
  const clamped = Math.max(-10, Math.min(10, value));
  const tier = standingTier(clamped);
  const label = t('contacts.standingTierValue', {
    tier: t(`contacts.tier.${tier}`),
    value: clamped,
  });
  return (
    <Tooltip content={label} openOnTap>
      <span role="img" aria-label={label} className={`inline-flex shrink-0 ${className}`}>
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
