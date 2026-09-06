/**
 * The plain-English half of an Open Orders row: what `orderRowSummary`
 * found, formatted and translated.
 *
 * Split from the badge rather than folded into it because the two answer
 * different questions — the badge says WHICH problem and is the thing the
 * eye scans a column of, this says WHAT is happening and is read one row at
 * a time. Keeping the formatting here (and the facts in the pure module) is
 * what lets the sentence be a single interpolated i18n string instead of
 * fragments concatenated in code, which no translator could reorder.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIsk } from '@/lib/isk';
import { orderRowSummary } from './orderRowSummary';
import type { OpenOrderRow } from './openOrdersModel';

const SCOPE_KEY = {
  station: 'market.orders.rowSummary.undercutStation',
  system: 'market.orders.rowSummary.undercutSystem',
  region: 'market.orders.rowSummary.undercutRegion',
} as const;

export function OrderRowSummaryText({ row }: { row: OpenOrderRow }): ReactElement | null {
  const { t } = useTranslation();
  const summary = orderRowSummary(row);
  if (!summary) return null;

  switch (summary.kind) {
    case 'undercut': {
      const parts = [
        t(SCOPE_KEY[summary.scope], {
          price: formatIsk(summary.rivalPrice, 2),
          gap: formatIsk(summary.gapIsk, 2),
        }),
      ];
      if (summary.sellersUnderMe !== null) {
        parts.push(t('market.orders.rowSummary.sellersUnderMe', { count: summary.sellersUnderMe }));
      }
      if (summary.match) {
        parts.push(
          t(
            summary.match.kind === 'profit'
              ? 'market.orders.rowSummary.matchProfit'
              : 'market.orders.rowSummary.matchLoss',
            { amount: formatIsk(summary.match.amount, 2) }
          )
        );
      }
      // The match clause is the only one whose tone differs from the rest of
      // the sentence — a loss there is the reason not to follow the rival.
      return (
        <span className="text-xs text-text-dim">
          {parts.slice(0, summary.match ? -1 : undefined).join(' · ')}
          {summary.match && (
            <>
              {' · '}
              <span className={summary.match.kind === 'loss' ? 'text-danger' : 'text-success'}>
                {parts[parts.length - 1]}
              </span>
            </>
          )}
        </span>
      );
    }
    case 'belowFloor':
      return (
        <span className="text-xs text-danger">
          {t('market.orders.rowSummary.belowFloor', {
            amount: formatIsk(summary.lossPerUnit, 2),
          })}
        </span>
      );
    case 'expiring':
      return (
        <span className="text-xs text-text-dim">
          {summary.daysLeft === null
            ? t('market.orders.rowSummary.expiringUnknown', {
                units: summary.volumeRemain.toLocaleString(),
              })
            : t('market.orders.rowSummary.expiring', {
                days: summary.daysLeft,
                units: summary.volumeRemain.toLocaleString(),
              })}
        </span>
      );
    case 'outbid':
      return (
        <span className="text-xs text-text-dim">
          {t('market.orders.rowSummary.outbid', {
            price: formatIsk(summary.rivalPrice, 2),
            gap: formatIsk(summary.gapIsk, 2),
          })}
        </span>
      );
    case 'noCostBasis':
      return (
        <span className="text-xs text-text-dim">{t('market.orders.rowSummary.noCostBasis')}</span>
      );
    case 'best':
    default:
      return <span className="text-xs text-text-dim">{t('market.orders.rowSummary.best')}</span>;
  }
}
