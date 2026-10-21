/**
 * The selected offer's profit breakdown (right pane on desktop, bottom sheet on a
 * phone), plus the row-level helpers it shares with the offers table.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  buttonClassName,
  DataTable,
  FilterChip,
  IskAmount,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { formatIsk } from '@/lib/isk';
import { iskPerConcordLp, type ConcordRate } from '@/engine/loyalty/concordExchange';
import { nameForType, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import type { PriceBasis } from './priceBasis';
import type { LpBasis } from './lpBasis';
import type { LoyaltyOfferRow } from './offerRows';
import { iskPerLpTone, resolveLoyaltyRowItem } from './offerRowDisplay';
import { loyaltyOfferMaterialsCsvColumns } from './loyaltyStoreCsv';
import { formatCount } from '@/lib/formatCount';

/**
 * Item name: plain text. The row's click selects it for the detail pane, so
 * the name is not a link (DESIGN.md §6c); `OfferDetail`'s View in Market is
 * the Market link. A blueprint row is labelled with the product that button
 * opens; the BP badge beside it still marks the row as a blueprint.
 */
export function LoyaltyItemName({ row }: { row: LoyaltyOfferRow }) {
  const { typeId, itemName } = resolveLoyaltyRowItem(row);
  return <span className={entityLinkClassName()}>{typeId === null ? row.itemName : itemName}</span>;
}

interface OfferDetailProps {
  row: LoyaltyOfferRow;
  catalog: BlueprintCatalog | null;
  hubId: string;
  hubName: string;
  priceBasis: PriceBasis;
  lpBasis: LpBasis;
  concord: ConcordRate | null;
  concordPending: boolean;
  playerLp: number | null;
  useOwnMaterials: boolean;
  onToggleUseOwnMaterials: () => void;
  onPlanInIndustry: (row: LoyaltyOfferRow) => Promise<void>;
}

const EMPTY_MATERIALS: readonly ResolvedMaterial[] = [];

export function OfferDetail({
  row,
  catalog,
  hubId,
  hubName,
  priceBasis,
  lpBasis,
  concord,
  concordPending,
  playerLp,
  useOwnMaterials,
  onToggleUseOwnMaterials,
  onPlanInIndustry,
}: OfferDetailProps) {
  const { t } = useTranslation();
  const { typeId: marketTypeId, itemName: displayName } = resolveLoyaltyRowItem(row);
  const { profit } = row;
  const shownIskPerLp =
    lpBasis === 'concord'
      ? concord
        ? iskPerConcordLp(profit.iskPerLp, concord.rate)
        : null
      : profit.iskPerLp;

  const materialColumns = useMemo<DataTableColumn<ResolvedMaterial>[]>(
    () => [
      {
        id: 'name',
        header: t('loyaltyStore.materialColName'),
        primary: true,
        sortValue: (material) =>
          catalog ? nameForType(catalog, material.typeID) : `#${material.typeID}`,
        render: (material) => (
          <MarketItemLink typeId={material.typeID} hubId={hubId}>
            {catalog ? nameForType(catalog, material.typeID) : `#${material.typeID}`}
          </MarketItemLink>
        ),
      },
      {
        id: 'needed',
        header: t('loyaltyStore.materialColNeeded'),
        align: 'right',
        className: 'tabular-nums text-text-dim',
        sortValue: (material) => material.quantity,
        render: (material) => formatCount(material.quantity),
      },
      {
        id: 'owned',
        header: t('loyaltyStore.materialColOwned'),
        align: 'right',
        className: 'tabular-nums text-text-dim',
        sortValue: (material) => material.ownedQuantity,
        render: (material) => formatCount(material.ownedQuantity),
      },
      {
        id: 'buyCost',
        header: t('loyaltyStore.materialColBuyCost'),
        align: 'right',
        className: 'tabular-nums text-text',
        sortValue: (material) => material.lineCost,
        render: (material) => <IskAmount value={material.lineCost} decimals={0} />,
      },
    ],
    [t, catalog, hubId]
  );
  const materialCsvColumns = useMemo(
    () =>
      loyaltyOfferMaterialsCsvColumns(t, (typeId) =>
        catalog ? nameForType(catalog, typeId) : `#${typeId}`
      ),
    [t, catalog]
  );
  const materialsExport = useTableExport({
    surface: 'lp-offer-materials',
    rows: row.build?.materials ?? EMPTY_MATERIALS,
    columns: materialCsvColumns,
    qualifier: displayName,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-medium text-text">{displayName}</h3>
        {row.isBlueprint && <p className="text-xs text-text-dim">{row.itemName}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {marketTypeId !== null && (
          <MarketItemLink
            typeId={marketTypeId}
            hubId={hubId}
            className={buttonClassName({ variant: 'ghost', size: 'sm' })}
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon.Market size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              {t('loyaltyStore.viewInMarket')}
            </span>
          </MarketItemLink>
        )}
        {row.isBlueprint && row.productTypeId !== null && (
          <Button variant="ghost" size="sm" onClick={() => void onPlanInIndustry(row)}>
            <span className="inline-flex items-center gap-1.5">
              <Icon.Industry size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              {t('loyaltyStore.planInIndustry')}
            </span>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-6">
        <div>
          <div className={eyebrowClassName}>
            {t(
              lpBasis === 'concord' ? 'loyaltyStore.colIskPerConcordLp' : 'loyaltyStore.colIskPerLp'
            )}
          </div>
          <div className={`text-3xl font-semibold tabular-nums ${iskPerLpTone(shownIskPerLp)}`}>
            {lpBasis === 'concord' && !concord && !concordPending
              ? t('loyaltyStore.noConcordExchange')
              : shownIskPerLp === null
                ? '—'
                : shownIskPerLp.toFixed(1)}
          </div>
        </div>
        <div>
          <div className={eyebrowClassName}>{t('loyaltyStore.netProfit')}</div>
          <div className={`text-xl font-semibold tabular-nums ${iskPerLpTone(profit.profit)}`}>
            {profit.profit === null ? '—' : <IskAmount value={profit.profit} decimals={0} />}
          </div>
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-xs">
        <div className="flex justify-between gap-4 text-text-dim">
          <dt>
            {t(priceBasis === 'buy' ? 'loyaltyStore.buyPriceAt' : 'loyaltyStore.sellPriceAt', {
              hub: hubName,
            })}
          </dt>
          <dd className="tabular-nums text-text">
            {profit.revenue === null ? '—' : formatIsk(profit.revenue)}
          </dd>
        </div>
        <div className="flex justify-between gap-4 text-text-dim">
          <dt>{t('loyaltyStore.storeCost')}</dt>
          <dd className="tabular-nums text-text">
            {formatCount(row.offer.lp_cost)} LP + {formatIsk(row.offer.isk_cost)} ISK
          </dd>
        </div>
        {row.requiredItems.length > 0 && (
          <>
            <div className="flex justify-between gap-4 text-text-dim">
              <dt>{t('loyaltyStore.requiredItems')}</dt>
              <dd className="tabular-nums text-text">
                {row.requiredItemsCost === null ? (
                  <span className="text-warning">{t('loyaltyStore.requiredItemsNotPriced')}</span>
                ) : (
                  formatIsk(row.requiredItemsCost)
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 pl-3">
              {row.requiredItems.map((item) => (
                <div
                  key={item.typeId}
                  className="flex justify-between gap-4 text-[0.6875rem] text-text-dim"
                >
                  <dt>
                    {formatCount(item.quantity)} ×{' '}
                    <MarketItemLink typeId={item.typeId} hubId={hubId}>
                      {item.name}
                    </MarketItemLink>
                  </dt>
                  <dd className="tabular-nums">
                    {item.unitPrice === null ? (
                      <span className="text-warning">
                        {t('loyaltyStore.requiredItemsNotPriced')}
                      </span>
                    ) : (
                      formatIsk(item.unitPrice * item.quantity)
                    )}
                  </dd>
                </div>
              ))}
            </div>
          </>
        )}
        {row.isBlueprint && row.build && (
          <div className="flex justify-between gap-4 text-text-dim">
            <dt>{t('loyaltyStore.materials')}</dt>
            <dd className="tabular-nums text-text">
              {formatIsk(row.build.materialCost + row.build.jobFee.total)}
            </dd>
          </div>
        )}
        <div className="mt-1 flex justify-between gap-4 border-t border-line pt-1 font-semibold text-text">
          <dt>{t('loyaltyStore.netProfit')}</dt>
          <dd className={`tabular-nums ${iskPerLpTone(profit.profit)}`}>
            {profit.profit === null ? '—' : formatIsk(profit.profit)}
          </dd>
        </div>
      </dl>

      {profit.affordableLp === false && playerLp !== null && (
        <p className="text-xs text-text-dim">
          {t('loyaltyStore.needMoreLp', {
            amount: formatCount(row.offer.lp_cost - playerLp),
          })}
        </p>
      )}
      {profit.profit === null && (
        <p className="text-xs text-warning">
          {/* A required item with no hub price is a real, distinct cause from
              a material or the product itself lacking one (row.build's
              `unpricedMaterials` / a null `profit.revenue`) — naming the
              wrong one would send the player looking for a Jita order that
              was never missing. `requiredItemsCost` is the same null the
              engine already used to null `profit.profit`, so this reads the
              actual cause rather than re-deriving it. */}
          {t(
            row.requiredItemsCost === null
              ? 'loyaltyStore.unpriceableRequiredItem'
              : 'loyaltyStore.unpriceable'
          )}
        </p>
      )}

      {row.isBlueprint && row.build && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-2">
            <FilterChip
              label={t('loyaltyStore.useOwnMaterials')}
              selected={useOwnMaterials}
              onToggle={onToggleUseOwnMaterials}
            />
            <TableActionsMenu name={t('loyaltyStore.materials')} tableExport={materialsExport} />
          </div>
          <p className="text-[0.6875rem] text-text-dim">{t('loyaltyStore.useOwnMaterialsHint')}</p>
          <div className="overflow-x-auto">
            <DataTable
              {...materialsExport.tableProps}
              label={t('loyaltyStore.materials')}
              columns={materialColumns}
              rows={row.build.materials}
              rowKey={(material) => material.typeID}
              density="compact"
              responsive="table"
            />
          </div>
        </div>
      )}
    </div>
  );
}
