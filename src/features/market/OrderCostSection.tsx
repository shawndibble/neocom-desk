import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { formatMarketIsk } from '@/lib/isk';
import { roundPriceUp } from '@/engine/market/priceTick';
import { StructureFeeLine } from './StructureFeeLine';
import type { OpenOrderRow } from './openOrdersModel';
import type { OrderDetailView } from './orderDetailView';
import type { LocationState } from './orderScopeState';
import { CostLedger } from './OrderCostLedger';
import { formatCount } from '@/lib/formatCount';

/** "Cost basis" (sell orders only): the ledger the floor came from, the structure fee and the build link. */
export function OrderCostSection({
  row,
  location,
  relistFees,
  accountingLevel,
  expanded,
  onToggle,
}: {
  row: OpenOrderRow;
  location: LocationState;
  relistFees: OrderDetailView['relistFees'];
  accountingLevel: OrderDetailView['accountingLevel'];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  // The one floor this app shows as a figure (20260906-155913), rounded UP
  // to the nearest legal price (issue #1421): safe to type into an order,
  // never below the exact break-even — `belowFloor` detection elsewhere still
  // compares against the exact `row.floor.relist`, never this.
  const floorShown = row.floor ? (roundPriceUp(row.floor.relist) ?? row.floor.relist) : null;

  const costTrailing =
    floorShown !== null
      ? t('market.orders.detail.trailingFloor', { price: formatMarketIsk(floorShown) })
      : row.costBasis
        ? t('market.orders.trailingCostPerUnit', {
            amount: formatMarketIsk(row.costBasis.unitCost),
          })
        : t('market.orders.badge.noCostBasis');

  return (
    <section>
      <Disclosure
        label={t('market.orders.detail.sectionCost')}
        trailing={costTrailing}
        expanded={expanded}
        onToggle={onToggle}
      >
        <div className="space-y-1.5 px-3 py-2">
          {row.costBasis === null ? (
            <>
              <p className="text-sm text-text">{t('market.orders.noCostBasisTitle')}</p>
              <p className="text-xs text-text-dim">{t('market.orders.noCostBasisHint')}</p>
              {row.walletGap && (
                <p className="text-xs text-text-dim">
                  {row.walletGap.kind === 'partial'
                    ? t('market.orders.walletBasisPartial', {
                        covered: formatCount(row.walletGap.coveredUnits),
                        total: formatCount(row.walletGap.pool),
                      })
                    : t('market.orders.walletBasisHistoryShort')}
                  {row.walletGap.truncated ? ' ' + t('market.orders.walletBasisTruncated') : null}
                </p>
              )}
            </>
          ) : (
            <CostLedger
              row={row}
              costBasis={row.costBasis}
              relistFees={relistFees}
              floorShown={floorShown}
            />
          )}
          {location === 'structure' && (
            <StructureFeeLine
              structureId={row.locationId}
              gross={row.price * row.volumeRemain}
              accountingLevel={accountingLevel}
            />
          )}
          <Link to="/industry" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>
            {t('market.orders.linkBuild')}
          </Link>
        </div>
      </Disclosure>
    </section>
  );
}
