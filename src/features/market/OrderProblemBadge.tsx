/**
 * The one badge every Open Orders row carries (CONTEXT.md's redesigned
 * Market > Open Orders tab). Colour marks **scope** only — station (danger),
 * system (warning), region (accent) — per docs/DESIGN.md §7's "colour is
 * never the only signal": every badge shows its own words too, and a kind
 * that isn't about distance gets the same neutral line/panel-2 treatment as
 * `ProductionRunStatusChip`'s tone map, not an invented colour of its own.
 * `belowFloor` is the one exception to "scope only" — it's the worst
 * outcome an order can be in (a guaranteed loss), so it gets a stronger,
 * more saturated red than `undercutStation`'s plain scope-danger.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '@/components/ui';
import { cx } from '@/lib/cx';

export type OrderBadgeKind =
  | 'belowFloor'
  | 'undercutStation'
  | 'undercutSystem'
  | 'undercutRegion'
  | 'expiring'
  | 'stale'
  | 'offHub'
  | 'outbid'
  | 'best'
  | 'noCostBasis';

type BadgeTone = 'danger-strong' | 'danger' | 'warning' | 'accent' | 'success' | 'neutral';

/** Class strings lifted from this repo's own pills (`PlanVerdictHero`'s `PILL_TONE`, `ProductionRunStatusChip`'s `TONE_CLASS`) rather than invented. */
const TONE_CLASS: Record<BadgeTone, string> = {
  'danger-strong': 'border-danger bg-danger/25 text-danger',
  danger: 'border-danger/50 bg-danger/15 text-danger',
  warning: 'border-warning/50 bg-warning/15 text-warning',
  accent: 'border-accent/50 bg-accent/15 text-accent',
  success: 'border-success/50 bg-success/15 text-success',
  neutral: 'border-line bg-panel-2 text-text-dim',
};

const KIND_TONE: Record<OrderBadgeKind, BadgeTone> = {
  belowFloor: 'danger-strong',
  undercutStation: 'danger',
  undercutSystem: 'warning',
  undercutRegion: 'accent',
  expiring: 'neutral',
  stale: 'neutral',
  offHub: 'neutral',
  outbid: 'neutral',
  best: 'success',
  noCostBasis: 'neutral',
};

interface OrderProblemBadgeProps {
  kind: OrderBadgeKind;
  /** Short trailing detail already formatted by the caller, e.g. "-8.4%" or "7 jumps". */
  detail?: string;
  className?: string;
}

/**
 * One order's problem (or lack of one) as a labelled pill, plus an
 * `InfoTooltip` "?" trigger carrying the one-sentence explanation —
 * `StatChip`'s pattern for a non-interactive pill, since the pill itself
 * (a `<span>`) has nothing to focus and Radix's `Tooltip.Trigger` needs a
 * real focusable child.
 */
export function OrderProblemBadge({
  kind,
  detail,
  className = '',
}: OrderProblemBadgeProps): ReactElement {
  const { t } = useTranslation();
  const label = t(`market.orders.badge.${kind}`);

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-xs border px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-widest uppercase',
        TONE_CLASS[KIND_TONE[kind]],
        className
      )}
    >
      <span>{label}</span>
      {detail && <span className="normal-case tracking-normal">{detail}</span>}
      <InfoTooltip
        label={t('common.aboutLabel', { label })}
        content={t(`market.orders.badge.${kind}Help`)}
      />
    </span>
  );
}
