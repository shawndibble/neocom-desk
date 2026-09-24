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
import { Tooltip } from '@/components/ui';
import { cx } from '@/lib/cx';
import { formatIskAuto } from '@/lib/isk';
import { orderRowSummary } from './orderRowSummary';
import type { OpenOrderRow } from './openOrdersModel';

const SCOPE_KEY = {
  station: 'market.orders.rowSummary.undercutStation',
  system: 'market.orders.rowSummary.undercutSystem',
  region: 'market.orders.rowSummary.undercutRegion',
} as const;

export function OrderRowSummaryText({
  row,
  interactive = true,
}: {
  row: OpenOrderRow;
  /** Drops the match clause's `Tooltip` trigger, leaving plain text — same reasoning as `OrderProblemBadge`'s own `interactive` prop. */
  interactive?: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const summary = orderRowSummary(row);
  if (!summary) return null;

  switch (summary.kind) {
    case 'undercut': {
      const parts = [t(SCOPE_KEY[summary.scope], { price: formatIskAuto(summary.rivalPrice) })];
      if (summary.sellersUnderMe !== null) {
        parts.push(t('market.orders.rowSummary.sellersUnderMe', { count: summary.sellersUnderMe }));
      }
      if (summary.match) {
        parts.push(
          t(
            summary.match.kind === 'profit'
              ? 'market.orders.rowSummary.matchProfit'
              : 'market.orders.rowSummary.matchLoss',
            { amount: formatIskAuto(summary.match.amount) }
          )
        );
      }
      // `summary.match` is only ever non-null once `suggestedPrice` is
      // non-null too (`matchOutcome` in orderRowSummary.ts returns null
      // otherwise), so this is safe to format unconditionally below.
      // The match clause is the only one whose tone differs from the rest of
      // the sentence — a loss there is the reason not to follow the rival.
      const matchNode = summary.match && (
        <span
          tabIndex={interactive ? 0 : undefined}
          className={cx(
            summary.match.kind === 'loss' ? 'text-danger' : 'text-success',
            interactive && 'cursor-help underline decoration-dotted underline-offset-2',
            interactive &&
              (summary.match.kind === 'loss' ? 'decoration-danger/50' : 'decoration-success/50')
          )}
        >
          {parts[parts.length - 1]}
        </span>
      );
      return (
        <span className="text-xs text-text-dim">
          {parts.slice(0, summary.match ? -1 : undefined).join(' · ')}
          {matchNode && (
            <>
              {' · '}
              {interactive ? (
                <Tooltip
                  content={t('market.orders.rowSummary.matchTooltip', {
                    undercut: formatIskAuto(summary.suggestedPrice ?? summary.rivalPrice),
                    floor: row.floor ? formatIskAuto(row.floor.relist) : '',
                  })}
                  openOnTap
                >
                  {matchNode}
                </Tooltip>
              ) : (
                matchNode
              )}
            </>
          )}
        </span>
      );
    }
    case 'belowFloor':
      return (
        <span className="text-xs text-danger">
          {t('market.orders.rowSummary.belowFloor', {
            amount: formatIskAuto(summary.lossPerUnit),
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
            price: formatIskAuto(summary.rivalPrice),
            gap: formatIskAuto(summary.gapIsk),
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
