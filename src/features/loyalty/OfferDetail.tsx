/**
 * The selected offer's profit breakdown (right pane on desktop, bottom sheet on a
 * phone), plus the row-level helpers it shares with the offers table.
 */
import { fixed1 } from '@/lib/fixedFormat';
import { useMemo, useState } from 'react';
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
import { iskPerLpTone, resolveLoyaltyRowItem, tagWordClassName } from './offerRowDisplay';
import { loyaltyOfferMaterialsCsvColumns } from './loyaltyStoreCsv';
import { formatCount } from '@/lib/formatCount';
import type { SkillLevels } from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { TradeHub } from '@/market/hubs';
import { SourcingInput } from '@/features/industry/SourcingInput';
import { parseOrKeep } from '@/features/industry/planInputParsers';
import { useRedemptionPricing } from './useRedemptionPricing';

/**
 * Item name: plain text. The row's click selects it for the detail pane, so
 * the name is not a link (DESIGN.md §6c); `OfferDetail`'s View in Market is
 * the Market link. A blueprint row is labelled with the product that button
 * opens; the BP badge beside it still marks the row as a blueprint.
 */
function LoyaltyItemName({ row }: { row: LoyaltyOfferRow }) {
  const { typeId, itemName } = resolveLoyaltyRowItem(row);
  return <span className={entityLinkClassName()}>{typeId === null ? row.itemName : itemName}</span>;
}

/** An offers table's item cell: the name, a BP marker for a blueprint, and its LP + ISK price. */
export function LoyaltyOfferItemCell({ row }: { row: LoyaltyOfferRow }) {
  return (
    <span className="flex flex-col">
      <span className="inline-flex items-center gap-1.5">
        <LoyaltyItemName row={row} />
        {row.isBlueprint && <span className={tagWordClassName}>BP</span>}
      </span>
      <span className="text-[0.6875rem] text-text-dim">
        {formatCount(row.offer.lp_cost)} LP + <IskAmount value={row.offer.isk_cost} decimals={0} />
      </span>
    </span>
  );
}

interface OfferDetailProps {
  row: LoyaltyOfferRow;
  catalog: BlueprintCatalog | null;
  hub: TradeHub;
  hubId: string;
  hubName: string;
  skills: SkillLevels;
  standing: ResolvedStandings | undefined;
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
  hub,
  hubId,
  hubName,
  skills,
  standing,
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
  // "How many" starts at 1 each time the detail opens (the route keys this
  // component by offer) and is never remembered.
  const [redemptions, setRedemptions] = useState(1);
  const { result: walked, loading: walking } = useRedemptionPricing({
    row,
    catalog,
    hub,
    redemptions,
    priceBasis,
    skills,
    standing,
    playerLp,
  });
  const profit = walked?.profit ?? row.profit;
  const requiredItemsCost = walked ? walked.requiredItemsCost : row.requiredItemsCost;
  const anyUnfilled = walked?.requiredLines.some((line) => line.unfilled > 0) ?? false;
  const inLpBasis = (iskPerLp: number | null): number | null =>
    lpBasis === 'concord' ? (concord ? iskPerConcordLp(iskPerLp, concord.rate) : null) : iskPerLp;
  const shownIskPerLp = inLpBasis(profit.iskPerLp);
  const formatIskPerLp = (value: number | null): string => (value === null ? '—' : fixed1(value));

  const materialColumns = useMemo<DataTableColumn<ResolvedMaterial>[]>(
    () => [
      {
        id: 'name',
        stickyStart: true,
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

      <label className="flex items-center gap-2 text-xs text-text-dim">
        {t('loyaltyStore.howMany')}
        <SourcingInput
          value={redemptions}
          label={t('loyaltyStore.howMany')}
          inputMode="numeric"
          widthClassName="w-16"
          parse={(raw) => parseOrKeep(redemptions, raw, (n) => Math.max(1, Math.round(n)))}
          onCommit={(next) => {
            if (next !== undefined) setRedemptions(next);
          }}
        />
      </label>
      {walking && <p className="text-xs text-text-dim">{t('loyaltyStore.walkedLoading')}</p>}

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
                : fixed1(shownIskPerLp)}
          </div>
          {walked && (
            <div className="text-[0.6875rem] tabular-nums text-text-dim">
              {t('loyaltyStore.iskPerLpAtN', {
                atN: formatIskPerLp(shownIskPerLp),
                n: formatCount(redemptions),
                at1: formatIskPerLp(inLpBasis(row.profit.iskPerLp)),
              })}
            </div>
          )}
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
          <dd className={`tabular-nums ${walked?.output.moved ? 'text-warning' : 'text-text'}`}>
            {walked?.output.moved && `${t('loyaltyStore.walkedAverage')} `}
            {profit.revenue === null ? '—' : formatIsk(profit.revenue)}
          </dd>
        </div>
        {row.revenueCheck?.capped && !walked?.output.moved && (
          <div className="text-right text-[0.6875rem] text-warning">
            {t(
              priceBasis === 'buy'
                ? 'loyaltyStore.revenueCappedBuy'
                : 'loyaltyStore.revenueCappedSell',
              {
                price: formatIsk(row.revenueCheck.price),
                listed: formatIsk(row.revenueCheck.listed),
              }
            )}
          </div>
        )}
        {walked && walked.output.unsold > 0 && (
          <div className="text-right text-[0.6875rem] text-warning">
            {t('loyaltyStore.unsoldUnits', { count: walked.output.unsold })}
          </div>
        )}
        <div className="flex justify-between gap-4 text-text-dim">
          <dt>{t('loyaltyStore.storeCost')}</dt>
          <dd className="tabular-nums text-text">
            {formatCount(walked ? walked.totals.lpCost : row.offer.lp_cost)} LP +{' '}
            {formatIsk(walked ? walked.totals.iskCost : row.offer.isk_cost)} ISK
          </dd>
        </div>
        {row.requiredItems.length > 0 && (
          <>
            <div className="flex justify-between gap-4 text-text-dim">
              <dt>{t('loyaltyStore.requiredItems')}</dt>
              <dd className="tabular-nums text-text">
                {requiredItemsCost === null ? (
                  <span className="text-warning">{t('loyaltyStore.requiredItemsNotPriced')}</span>
                ) : (
                  formatIsk(requiredItemsCost)
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 pl-3">
              {row.requiredItems.map((item, index) => {
                const line = walked?.requiredLines[index];
                const lineCost = line
                  ? line.lineCost
                  : item.unitPrice === null
                    ? null
                    : item.unitPrice * item.quantity;
                return (
                  <div
                    key={item.typeId}
                    className="flex justify-between gap-4 text-[0.6875rem] text-text-dim"
                  >
                    <dt>
                      {formatCount(line ? line.unitsNeeded : item.quantity)} ×{' '}
                      <MarketItemLink typeId={item.typeId} hubId={hubId}>
                        {item.name}
                      </MarketItemLink>
                    </dt>
                    <dd className="tabular-nums">
                      {line && line.unfilled > 0 ? (
                        <span className="text-warning">
                          {t('loyaltyStore.unfilledUnits', { count: line.unfilled })}
                        </span>
                      ) : lineCost === null ? (
                        <span className="text-warning">
                          {t('loyaltyStore.requiredItemsNotPriced')}
                        </span>
                      ) : (
                        <span className={line?.moved ? 'text-warning' : undefined}>
                          {line?.moved && `${t('loyaltyStore.walkedAverage')} `}
                          {formatIsk(lineCost)}
                        </span>
                      )}
                    </dd>
                  </div>
                );
              })}
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
      {profit.profit === null && !anyUnfilled && (
        <p className="text-xs text-warning">
          {/* A required item with no hub price is a real, distinct cause from
              a material or the product itself lacking one (row.build's
              `unpricedMaterials` / a null `profit.revenue`) — naming the
              wrong one would send the player looking for a Jita order that
              was never missing. `requiredItemsCost` is the same null the
              engine already used to null `profit.profit`, so this reads the
              actual cause rather than re-deriving it. */}
          {t(
            requiredItemsCost === null
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
