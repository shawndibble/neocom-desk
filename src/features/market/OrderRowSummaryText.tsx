import { HintText } from '@/components/ui/HintText';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { formatIskAuto, formatMarketIsk } from '@/lib/isk';
import { CopyablePrice } from './CopyablePrice';
import { orderRowSummary, type OrderRowSummary } from './orderRowSummary';
import type { OpenOrderRow } from './openOrdersModel';
import { formatCount } from '@/lib/formatCount';

const SCOPE_KEY = {
  station: 'market.orders.rowSummary.undercutStation',
  system: 'market.orders.rowSummary.undercutSystem',
  region: 'market.orders.rowSummary.undercutRegion',
} as const;

export function OrderRowSummaryText({
  row,
  interactive = true,
  copyRelistPrice = false,
  summary: given,
}: {
  row: OpenOrderRow;
  summary?: OrderRowSummary | null;
  interactive?: boolean;
  copyRelistPrice?: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const summary = given === undefined ? orderRowSummary(row) : given;
  if (!summary) return null;
  const relistPrice =
    copyRelistPrice && (summary.kind === 'undercut' || summary.kind === 'outbid')
      ? summary.suggestedPrice
      : null;
  const relistNode = relistPrice !== null && (
    <>
      {' '}
      <span className="text-text">
        <CopyablePrice price={relistPrice}>
          {t('market.orders.relistTo', { price: formatMarketIsk(relistPrice) })}
        </CopyablePrice>
      </span>
    </>
  );

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
      const matchTone = summary.match?.kind === 'loss' ? 'text-danger' : 'text-success';
      const matchText = parts[parts.length - 1];
      return (
        <span className="text-xs text-text-dim">
          {parts.slice(0, summary.match ? -1 : undefined).join(' · ')}
          {summary.match && (
            <>
              {' · '}
              {interactive ? (
                <HintText
                  content={t('market.orders.rowSummary.matchTooltip', {
                    undercut: formatIskAuto(summary.suggestedPrice ?? summary.rivalPrice),
                    floor: row.floor ? formatIskAuto(row.floor.relist) : '',
                  })}
                  className={matchTone}
                >
                  {matchText}
                </HintText>
              ) : (
                <span className={matchTone}>{matchText}</span>
              )}
            </>
          )}
          {relistNode}
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
                units: formatCount(summary.volumeRemain),
              })
            : t('market.orders.rowSummary.expiring', {
                days: summary.daysLeft,
                units: formatCount(summary.volumeRemain),
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
          {relistNode}
        </span>
      );
    case 'ownRival':
      return (
        <span className="text-xs text-text-dim">
          {t('market.orders.rowSummary.ownRival', {
            character: summary.characterName,
            price: formatIskAuto(summary.price),
          })}
        </span>
      );
    case 'noCostBasis':
      return (
        <span className="text-xs text-text-dim">{t('market.orders.rowSummary.noCostBasis')}</span>
      );
    case 'topBid':
      return <span className="text-xs text-text-dim">{t('market.orders.rowSummary.topBid')}</span>;
    case 'best':
    default:
      return <span className="text-xs text-text-dim">{t('market.orders.rowSummary.best')}</span>;
  }
}
