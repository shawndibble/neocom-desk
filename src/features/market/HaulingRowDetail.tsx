/**
 * What opens beneath a Hauling row, in three plain groups so each figure can
 * be traced to the one before it:
 *
 * 1. **Expected sell price**: the two prices it is the lower of, with the
 *    cheapest listing shown only for reference.
 * 2. **How fast it sells**: sales per day and the units listed ahead.
 * 3. **The load and the margin**: buy and sell as quantity × unit price, the
 *    two fees indented under the sale, then profit and margin.
 *
 * Beside them, the hub's cheapest sell orders as a table with the expected
 * price marked in place, so "units listed ahead of yours" is something you can
 * count rather than a bar to interpret. Below `lg` that table waits behind a
 * button, so a phone opens on the figures rather than a screenful of orders.
 *
 * The figures speak for themselves; what each one means sits behind a `?`
 * beside its heading (`InfoTooltip`, tap or hover) rather than printed under
 * it.
 *
 * A row sold straight into the destination's buy orders has no Expected Sell
 * Price and no Days to Sell: it opens on the load and margin (sales tax only)
 * beside the hub station's buy orders, the ones the load sells into shaded.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InfoTooltip } from '@/components/ui';
import { HAULING_THRESHOLDS, lotEconomics } from '@/engine/market/haulingMarket';
import { formatIsk } from '@/lib/isk';
import { MarketItemLink } from './MarketItemLink';
import type { InstantHaulingScanRow, ListHaulingScanRow } from './haulingData';
import { formatDaysToSell, type HaulingViewRow } from './haulingView';

const ORDER_LEVELS = 8;

/** The row carries its own lane and fees: with Any hub at one end, each row may use a different hub. */
interface HaulingRowDetailProps {
  row: HaulingViewRow;
  /** What capped the planned quantity ("22 m³ · about a week of sales") — the Bring box's own `title`, said again here for touch. */
  loadNote?: string;
}

interface DetailProps<Row> {
  row: Row;
  loadNote?: string;
}

function Section({
  title,
  tip,
  children,
}: {
  title: string;
  /** What the section's figures mean, behind a `?` beside the heading. */
  tip?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-center gap-1.5 border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {title}
        {tip && (
          <InfoTooltip label={t('market.hauling.detail.about', { section: title })} content={tip} />
        )}
      </h4>
      {children}
    </section>
  );
}

/** The order table: in place from `lg` up, behind a toggle below it. */
function OrdersDisclosure({
  showLabel,
  hideLabel,
  children,
}: {
  showLabel: string;
  hideLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="self-start lg:hidden"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        {open ? hideLabel : showLabel}
      </Button>
      <div className={open ? undefined : 'max-lg:hidden'}>{children}</div>
    </div>
  );
}

/** One label / detail / amount line. `indent` sets a sub-item under the line above it. */
function Line({
  label,
  detail,
  amount,
  indent = false,
  strong = false,
  tone,
}: {
  label: ReactNode;
  detail?: ReactNode;
  amount: ReactNode;
  indent?: boolean;
  strong?: boolean;
  tone?: 'success' | 'danger';
}) {
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto_7.5rem] items-baseline gap-x-3 text-sm tabular-nums ${
        indent ? 'ml-4 border-l border-line pl-3 text-[0.8125rem]' : ''
      } ${strong ? 'font-semibold' : ''}`}
    >
      <span className={strong ? 'text-text' : 'text-text-dim'}>{label}</span>
      <span className="text-[0.75rem] text-text-dim">{detail}</span>
      <span
        className={`text-right ${tone === 'success' ? 'text-success' : ''} ${
          tone === 'danger' ? 'text-danger' : ''
        }`}
      >
        {amount}
      </span>
    </div>
  );
}

export function HaulingRowDetail({ row, loadNote }: HaulingRowDetailProps) {
  return row.mode === 'instant' ? (
    <InstantDetail row={row} loadNote={loadNote} />
  ) : (
    <ListingDetail row={row} loadNote={loadNote} />
  );
}

/** The unit volume and what capped the plan's quantity — the facts the compact row no longer prints. */
/** The item in the Market Browser at the destination hub — its full order book and price history. */
function MarketLink({ row }: { row: HaulingViewRow }) {
  const { t } = useTranslation();
  return (
    <MarketItemLink
      typeId={row.typeId}
      hubId={row.toHub.id}
      className="self-start text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {t('market.hauling.detail.openInMarket', { hub: row.toHub.systemName })}
    </MarketItemLink>
  );
}

function LoadNote({ row, note }: { row: HaulingViewRow; note: string | undefined }) {
  const { t } = useTranslation();
  const volume = t('market.hauling.volumeEach', {
    m3: row.unitVolumeM3.toLocaleString(undefined, { maximumFractionDigits: 3 }),
  });
  return (
    <p className="text-xs text-text-dim">
      {note ? t('market.hauling.detail.planNote', { volume, note }) : volume}
    </p>
  );
}

function InstantDetail({ row, loadNote }: DetailProps<HaulingViewRow & InstantHaulingScanRow>) {
  const { t } = useTranslation();
  const { fromHub: from, toHub: to, fees } = row;
  const lot = lotEconomics({
    buyLadder: row.buyLadder,
    expectedPrice: 0,
    quantity: row.suggestedUnits,
    fees,
    destBuyLadder: row.destBuyLadder,
  });
  const avgBuy = lot.filled > 0 ? lot.cost / lot.filled : 0;
  const isk0 = (value: number) => formatIsk(value, 0);
  const each = (value: number) => `${value >= 0 ? '+' : '−'}${isk0(Math.abs(value))}`;

  const levels = row.destBuyLadder.slice(0, ORDER_LEVELS);
  const orderRows = levels.map((level, index) => {
    const before = levels.slice(0, index).reduce((sum, l) => sum + l.units, 0);
    return { ...level, running: before + level.units, soldInto: before < lot.filled };
  });

  return (
    <div className="bg-panel-2/40 p-4">
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        <Section
          title={t('market.hauling.detail.workingTitle', { count: lot.filled })}
          tip={t('market.hauling.detail.instantNote', { hub: to.systemName })}
        >
          {lot.filled === 0 ? (
            <p className="text-xs text-text-dim">{t('market.hauling.detail.noneProfitable')}</p>
          ) : (
            <>
              <Line
                label={t('market.hauling.detail.buyIn', { hub: from.systemName })}
                detail={t('market.hauling.detail.unitsAt', {
                  units: lot.filled.toLocaleString(),
                  price: formatIsk(avgBuy, 2),
                })}
                amount={`−${isk0(lot.cost)}`}
              />
              <Line
                label={t('market.hauling.detail.sellInto', { hub: to.systemName })}
                detail={t('market.hauling.detail.unitsAt', {
                  units: lot.filled.toLocaleString(),
                  price: formatIsk(row.price, 2),
                })}
                amount={`+${isk0(lot.revenue)}`}
              />
              <Line
                indent
                label={t('market.hauling.detail.tax')}
                detail={`${lot.salesTaxPct.toFixed(2)}%`}
                amount={`−${isk0(lot.salesTax)}`}
              />
              <div className="border-t border-line pt-2">
                <Line
                  strong
                  tone={lot.profit >= 0 ? 'success' : 'danger'}
                  label={t('market.hauling.detail.profit')}
                  detail={t('market.hauling.detail.eachShort', { isk: each(row.profitPerUnit) })}
                  amount={each(lot.profit)}
                />
                <Line
                  strong
                  label={t('market.hauling.detail.margin')}
                  detail={t('market.hauling.detail.marginHow')}
                  amount={`${lot.marginPct.toFixed(1)}%`}
                />
              </div>
              <LoadNote row={row} note={loadNote} />
            </>
          )}
        </Section>

        <Section
          title={t('market.hauling.detail.buyOrdersTitle', { hub: to.systemName })}
          tip={t('market.hauling.detail.buyOrdersNote')}
        >
          <OrdersDisclosure
            showLabel={t('market.hauling.detail.showOrders')}
            hideLabel={t('market.hauling.detail.hideOrders')}
          >
            <div className="overflow-x-auto">
              <table className="dt-embedded-table w-full min-w-[20rem] text-sm lg:min-w-0 tabular-nums">
                <thead>
                  <tr className="text-left text-[0.6875rem] tracking-wider text-text-dim uppercase">
                    <th className="py-1 font-semibold">{t('market.hauling.detail.colPrice')}</th>
                    <th className="py-1 text-right font-semibold">
                      {t('market.hauling.detail.colUnits')}
                    </th>
                    <th className="py-1 text-right font-semibold">
                      {t('market.hauling.detail.colTotal')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orderRows.map((level) => (
                    <tr
                      key={level.price}
                      className={`border-t border-line/60 ${level.soldInto ? 'bg-accent/10' : ''}`}
                    >
                      <td className="py-1">{formatIsk(level.price, 2)}</td>
                      <td className="py-1 text-right">{level.units.toLocaleString()}</td>
                      <td className="py-1 text-right text-text-dim">
                        {level.running.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </OrdersDisclosure>
          <MarketLink row={row} />
        </Section>
      </div>
    </div>
  );
}

function ListingDetail({ row, loadNote }: DetailProps<HaulingViewRow & ListHaulingScanRow>) {
  const { t } = useTranslation();
  const { fromHub: from, toHub: to, fees } = row;
  const { sale } = row;

  const lot = lotEconomics({
    buyLadder: row.buyLadder,
    expectedPrice: sale.price,
    quantity: row.suggestedUnits,
    fees,
  });
  const avgBuy = lot.filled > 0 ? lot.cost / lot.filled : 0;

  // What a tool that reads only the listed prices would promise for the same load.
  const listedOnly = lotEconomics({
    buyLadder: row.buyLadder,
    expectedPrice: sale.lowestAsk,
    quantity: row.suggestedUnits,
    fees,
  });
  const listedOnlyEach = listedOnly.filled > 0 ? listedOnly.profit / listedOnly.filled : 0;
  // Two figures within 2% say one thing: say nothing extra.
  const listedDiffers =
    Math.abs(listedOnlyEach - row.profitPerUnit) >
    0.02 * Math.max(Math.abs(listedOnlyEach), Math.abs(row.profitPerUnit));

  const isk0 = (value: number) => formatIsk(value, 0);
  const each = (value: number) => `${value >= 0 ? '+' : '−'}${isk0(Math.abs(value))}`;

  // The cheapest orders, with a marker where the expected price falls among them.
  const levels = row.destLadder.slice(0, ORDER_LEVELS);
  const orderRows = levels.map((level, index) => ({
    ...level,
    running: levels.slice(0, index + 1).reduce((sum, l) => sum + l.units, 0),
  }));
  const markerIndex = orderRows.findIndex((level) => level.price > sale.price);
  const markerAt = markerIndex === -1 ? orderRows.length : markerIndex;
  const reach = sale.price * (1 + HAULING_THRESHOLDS.crowdedBand);

  const days = formatDaysToSell(sale.daysToSell);
  const usesRecent = sale.recentSalePrice <= sale.undercutPrice;

  return (
    <div className="bg-panel-2/40 p-4">
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5">
          <Section
            title={t('market.hauling.detail.priceTitle')}
            tip={t('market.hauling.detail.priceTip')}
          >
            <Line
              indent
              label={t('market.hauling.detail.recentSale')}
              detail={usesRecent ? t('market.hauling.detail.used') : undefined}
              amount={formatIsk(sale.recentSalePrice, 2)}
            />
            <Line
              indent
              label={t('market.hauling.detail.undercut')}
              detail={usesRecent ? undefined : t('market.hauling.detail.used')}
              amount={formatIsk(sale.undercutPrice, 2)}
            />
            <Line
              strong
              tone="success"
              label={t('market.hauling.detail.expected')}
              amount={formatIsk(sale.price, 2)}
            />
            <Line
              indent
              label={t('market.hauling.detail.cheapest')}
              amount={formatIsk(sale.lowestAsk, 2)}
            />
          </Section>

          <Section
            title={t('market.hauling.detail.speedTitle')}
            tip={t('market.hauling.detail.regionNote', { hub: to.systemName })}
          >
            <Line
              label={t('market.hauling.detail.perDay')}
              amount={sale.dailyVolume.toLocaleString(undefined, { maximumFractionDigits: 1 })}
            />
            <Line
              label={t('market.hauling.detail.ahead')}
              amount={sale.unitsAhead.toLocaleString()}
            />
            <Line
              strong
              label={t('market.hauling.detail.daysToSell')}
              amount={t('market.hauling.detail.daysValue', { days })}
            />
          </Section>
        </div>

        <div className="flex flex-col gap-5">
          <Section title={t('market.hauling.detail.workingTitle', { count: lot.filled })}>
            <Line
              label={t('market.hauling.detail.buyIn', { hub: from.systemName })}
              detail={t('market.hauling.detail.unitsAt', {
                units: lot.filled.toLocaleString(),
                price: formatIsk(avgBuy, 2),
              })}
              amount={`−${isk0(lot.cost)}`}
            />
            <Line
              label={t('market.hauling.detail.sellIn', { hub: to.systemName })}
              detail={t('market.hauling.detail.unitsAt', {
                units: lot.filled.toLocaleString(),
                price: formatIsk(sale.price, 2),
              })}
              amount={`+${isk0(lot.revenue)}`}
            />
            <Line
              indent
              label={t('market.hauling.detail.tax')}
              detail={`${lot.salesTaxPct.toFixed(2)}%`}
              amount={`−${isk0(lot.salesTax)}`}
            />
            <Line
              indent
              label={t('market.hauling.detail.broker')}
              detail={`${lot.brokerFeePct.toFixed(2)}%`}
              amount={`−${isk0(lot.brokerFee)}`}
            />
            <div className="border-t border-line pt-2">
              <Line
                strong
                tone={lot.profit >= 0 ? 'success' : 'danger'}
                label={
                  listedDiffers ? (
                    <span className="inline-flex items-center gap-1.5">
                      {t('market.hauling.detail.profit')}
                      <InfoTooltip
                        label={t('market.hauling.detail.about', {
                          section: t('market.hauling.detail.profit'),
                        })}
                        content={t('market.hauling.detail.listedOnlyGap', {
                          listed: each(listedOnlyEach),
                          ours: each(row.profitPerUnit),
                        })}
                      />
                    </span>
                  ) : (
                    t('market.hauling.detail.profit')
                  )
                }
                detail={t('market.hauling.detail.eachShort', { isk: each(row.profitPerUnit) })}
                amount={each(lot.profit)}
              />
              <Line
                strong
                label={t('market.hauling.detail.margin')}
                detail={t('market.hauling.detail.marginHow')}
                amount={`${lot.marginPct.toFixed(1)}%`}
              />
            </div>
            <LoadNote row={row} note={loadNote} />
          </Section>
        </div>

        <div className="flex flex-col gap-5">
          <Section
            title={t('market.hauling.detail.ordersTitle', { hub: to.systemName })}
            tip={t('market.hauling.detail.ordersNote')}
          >
            <OrdersDisclosure
              showLabel={t('market.hauling.detail.showOrders')}
              hideLabel={t('market.hauling.detail.hideOrders')}
            >
              {/* `min-w` plus `overflow-x-auto`: a narrow phone scrolls this one
                table sideways rather than the whole card losing its columns —
                unlike `DataTable`, this is a plain `<table>` with no card
                layout to fall back to, so it must keep row/column shape at
                every width. `dt-embedded-table` is the hook `index.css` uses
                to undo the outer `DataTable`'s phone card-layout CSS, which
                otherwise leaks into this nested table too — see the comment
                there. */}
              <div className="overflow-x-auto">
                <table className="dt-embedded-table w-full min-w-[20rem] text-sm lg:min-w-0 tabular-nums">
                  <thead>
                    <tr className="text-left text-[0.6875rem] tracking-wider text-text-dim uppercase">
                      <th className="py-1 font-semibold">{t('market.hauling.detail.colPrice')}</th>
                      <th className="py-1 text-right font-semibold">
                        {t('market.hauling.detail.colUnits')}
                      </th>
                      <th className="py-1 text-right font-semibold">
                        {t('market.hauling.detail.colTotal')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderRows.flatMap((level, index) => {
                      const rows = [];
                      if (index === markerAt)
                        rows.push(<MarkerRow key="marker" price={sale.price} />);
                      rows.push(
                        <tr
                          key={level.price}
                          className={`border-t border-line/60 ${level.price <= reach ? 'bg-warning/10' : ''}`}
                        >
                          <td className="py-1">{formatIsk(level.price, 2)}</td>
                          <td className="py-1 text-right">{level.units.toLocaleString()}</td>
                          <td className="py-1 text-right text-text-dim">
                            {level.running.toLocaleString()}
                          </td>
                        </tr>
                      );
                      return rows;
                    })}
                    {markerAt === orderRows.length && <MarkerRow price={sale.price} />}
                  </tbody>
                </table>
              </div>
            </OrdersDisclosure>
            <MarketLink row={row} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function MarkerRow({ price }: { price: number }) {
  const { t } = useTranslation();
  return (
    <tr className="border-y border-accent-dim bg-accent/10 text-accent">
      <td className="py-1 font-semibold" colSpan={3}>
        {t('market.hauling.detail.yourPrice', { price: formatIsk(price, 2) })}
      </td>
    </tr>
  );
}
