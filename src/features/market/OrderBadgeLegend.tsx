/**
 * "What do these badges mean?" reference for the redesigned Open Orders tab
 * (CONTEXT.md) — every `OrderBadgeKind`, what it means, and what to do about
 * it, opened from a link under the order groups. Built on the repo's own
 * `Modal` (`placement="wide"` per the ticket, even though the content is a
 * single column — consistent with `RemapMarkerModal`'s always-mounted
 * pattern rather than `VariationsCompareModal`'s mount-on-open one, since
 * the parent here owns `open` the same way).
 */
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { OrderProblemBadge } from './OrderProblemBadge';
import { ORDER_BADGE_KINDS } from './orderBadgeKind';

interface OrderBadgeLegendProps {
  open: boolean;
  onClose: () => void;
}

export function OrderBadgeLegend({ open, onClose }: OrderBadgeLegendProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={t('market.orders.legendTitle')} placement="wide">
      <div className="space-y-3">
        <ul className="divide-y divide-line">
          {ORDER_BADGE_KINDS.map((kind) => (
            <li
              key={kind}
              className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-3"
            >
              <div className="sm:w-40 sm:shrink-0">
                <OrderProblemBadge kind={kind} />
              </div>
              <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                <p className="text-text">{t(`market.orders.badge.${kind}Help`)}</p>
                <p className="text-xs text-text-dim">{t(`market.orders.badge.${kind}Action`)}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="border-t border-line pt-3 text-xs text-text-dim">
          {t('market.orders.legendColourRule')}
        </p>
      </div>
    </Modal>
  );
}
