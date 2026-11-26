import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '@/components/ui';
import { cx } from '@/lib/cx';
import { badgeDetailText } from './orderBadgeKind';

export type OrderBadgeKind =
  | 'belowFloor'
  | 'undercutStation'
  | 'undercutSystem'
  | 'undercutRegion'
  | 'expiring'
  | 'outbid'
  | 'turnIn'
  | 'frequentlyUndercut'
  | 'best'
  | 'topBid'
  | 'noCostBasis'
  | 'notChecked';

type BadgeTone = 'danger-strong' | 'danger' | 'warning' | 'accent' | 'success' | 'neutral';

const TONE_CLASS: Record<BadgeTone, string> = {
  'danger-strong': 'bg-danger/25 text-danger',
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
  accent: 'bg-accent/15 text-accent',
  success: 'bg-success/15 text-success',
  neutral: 'bg-panel-2 text-text-dim',
};

const KIND_TONE: Record<OrderBadgeKind, BadgeTone> = {
  belowFloor: 'danger-strong',
  undercutStation: 'danger',
  undercutSystem: 'warning',
  undercutRegion: 'accent',
  expiring: 'neutral',
  outbid: 'neutral',
  turnIn: 'neutral',
  frequentlyUndercut: 'neutral',
  best: 'success',
  topBid: 'success',
  noCostBasis: 'neutral',
  notChecked: 'neutral',
};

interface OrderProblemBadgeProps {
  kind: OrderBadgeKind;
  detail?: string;
  className?: string;
  interactive?: boolean;
}

export function OrderProblemBadge({
  kind,
  detail,
  className = '',
  interactive = true,
}: OrderProblemBadgeProps): ReactElement {
  const { t } = useTranslation();
  const label = t(`market.orders.badge.${kind}`);

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-widest uppercase',
        TONE_CLASS[KIND_TONE[kind]],
        className
      )}
    >
      <span>{label}</span>
      {detail && (
        <span className="normal-case tracking-normal">{badgeDetailText(t, kind, detail)}</span>
      )}
      {interactive && (
        <InfoTooltip
          label={t('common.aboutLabel', { label })}
          content={t(`market.orders.badge.${kind}Help`)}
        />
      )}
    </span>
  );
}
