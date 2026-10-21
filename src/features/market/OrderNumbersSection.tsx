import { useTranslation } from 'react-i18next';
import { Disclosure, Field, Fields, InfoTooltip, ProgressBar } from '@/components/ui';
import type { RegionCompetition } from './orderCompetition';
import type { OpenOrderRow } from './openOrdersModel';
import { computeSellThrough, stationRank } from './orderScopeState';
import { IskDelta } from '@/components/ui/IskDelta';
import { formatCount } from '@/lib/formatCount';

/** "The numbers": rank, sell-through, volume, expiry and the net if it sells as listed. */
export function OrderNumbersSection({
  row,
  deep,
  sell,
  expanded,
  onToggle,
}: {
  row: OpenOrderRow;
  deep: RegionCompetition | null;
  sell: ReturnType<typeof computeSellThrough>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const sellValue =
    sell.kind === 'known'
      ? `${sell.daysToClear}d`
      : t(
          sell.reason === 'noHistory'
            ? 'market.orders.sellsOutUnknown'
            : 'market.orders.sellsOutNoSales'
        );
  const sellPastExpiry =
    sell.kind === 'known' && row.expiry !== null && sell.daysToClear > row.expiry.daysLeft;
  const rank = stationRank(row, deep);
  const netIfSellsAsListed = row.floor ? row.price - row.floor.fill : null;

  const numbersTrailing =
    sell.kind === 'known'
      ? t(
          row.isBuyOrder
            ? 'market.orders.detail.trailingFillsIn'
            : 'market.orders.detail.trailingSellsOut',
          { count: sell.daysToClear }
        )
      : sellValue;

  // Buy orders fill rather than sell out (#1733).
  const sellsOutLabel = t(row.isBuyOrder ? 'market.orders.fillsIn' : 'market.orders.sellsOutIn');

  return (
    <section>
      <Disclosure
        label={t('market.orders.sectionNumbers')}
        trailing={numbersTrailing}
        expanded={expanded}
        onToggle={onToggle}
      >
        <div className="px-3 py-2.5 text-sm">
          <Fields>
            {rank && (
              <Field label={t('market.orders.detail.rankLabel')}>
                <span className="tabular-nums">
                  {t('market.orders.detail.rankValue', {
                    rank: rank.rank,
                    total: rank.total,
                  })}
                </span>
              </Field>
            )}
            <Field
              label={
                <span className="inline-flex items-center gap-1">
                  {sellsOutLabel}
                  <InfoTooltip
                    label={t('common.aboutLabel', { label: sellsOutLabel })}
                    content={t(
                      row.isBuyOrder ? 'market.orders.fillsInHelp' : 'market.orders.sellsOutHelp'
                    )}
                  />
                </span>
              }
            >
              <span className="flex flex-col">
                <span className="tabular-nums">
                  <span className={sellPastExpiry ? 'text-danger' : 'text-text'}>{sellValue}</span>
                  {sell.kind === 'known' && (
                    <span className="text-text-dim">
                      {' · '}
                      {t('market.orders.statSellsOutCaption', {
                        count: Math.round(sell.unitsPerDay),
                      })}
                    </span>
                  )}
                </span>
                {sellPastExpiry && (
                  <span className="text-xs text-danger">
                    {t('market.orders.sellsOutPastExpiry')}
                  </span>
                )}
              </span>
            </Field>
            <Field label={t('market.orders.statVolumeLeft')}>
              {row.volumeTotal > 0 && (
                <ProgressBar
                  label={t('market.orders.statVolumeLeft')}
                  value={row.volumeRemain}
                  max={row.volumeTotal}
                  surface="panel-2"
                  className="w-24"
                />
              )}
              <span className="tabular-nums">
                {`${formatCount(row.volumeRemain)} / ${formatCount(row.volumeTotal)}`}
              </span>
            </Field>
            <Field label={t('market.orders.statOrderExpires')}>
              {row.expiry ? (
                <span className="tabular-nums">
                  <span className={row.expiry.daysLeft <= 7 ? 'text-warning' : 'text-text'}>
                    {`${row.expiry.daysLeft}d`}
                  </span>
                  <span className="text-text-dim">
                    {' · '}
                    {t('market.orders.statExpiresCaption', {
                      date: new Date(row.expiry.expiresAt).toLocaleDateString(),
                      listed: new Date(row.issued).toLocaleDateString(),
                    })}
                  </span>
                </span>
              ) : (
                t('common.unknown')
              )}
            </Field>
            <Field
              label={t(
                row.isBuyOrder
                  ? 'market.orders.statIfFillsAsListed'
                  : 'market.orders.statIfSellsAsListed'
              )}
            >
              {netIfSellsAsListed === null ? (
                t('common.unknown')
              ) : (
                <span className="tabular-nums">
                  <IskDelta amount={netIfSellsAsListed} />{' '}
                  <span className="text-text-dim">{t('market.orders.statPerUnitAfterFees')}</span>
                </span>
              )}
            </Field>
          </Fields>
        </div>
      </Disclosure>
    </section>
  );
}
