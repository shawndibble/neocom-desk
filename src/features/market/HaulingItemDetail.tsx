/**
 * A selected Hauling row's detail, in the trip rail or a phone sheet: the
 * most to pay, the destination's sell orders with the user's listing, Days to
 * Sell, and the math folded behind "Show the math". Sold into buy orders,
 * the buy orders it fills replace the sell orders and Days to Sell.
 * Header's `ItemMoreActions` ⋮ carries the item's actions. Sized for a ~20rem
 * rail and a 390px sheet: figures never break mid-number.
 */
import { fixed2 } from '@/lib/fixedFormat';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Disclosure, TypeIcon } from '@/components/ui';
import { buttonClassName } from '@/components/ui/buttonClassName';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatMarketIsk } from '@/lib/isk';
import { HAULING_THRESHOLDS, lotEconomics, type LadderLevel } from '@/engine/market/haulingMarket';
import { maxBuyPrice, type TripLine } from '@/engine/market/haulingPlan';
import { ItemInfoLink } from '@/features/entities';
import { routeToHref } from '@/features/route/routeSafetyLink';
import { formatSignedPct } from './format';
import { HaulingFlagWord } from './HaulingFlagWord';
import { ItemMoreActions } from './ItemContextMenu';
import { MarketItemLink } from './MarketItemLink';
import { marketIskTone, signedMarketIsk } from '@/lib/signedIsk';
import type { InstantHaulingScanRow, ListHaulingScanRow } from './haulingData';
import { formatDaysToSell, type HaulingViewRow } from './haulingView';

/** Orders shown from the destination's book; the Market link has the rest. */
const ORDER_LEVELS = 8;

export interface HaulingItemDetailProps {
  row: HaulingViewRow;
  /** The row's Trip Plan line, when it has one: what the plan brings of it. */
  line?: TripLine;
  /** What capped the line ("22 m³ · your share of a week's sales"), from the panel. */
  loadNote?: string;
  /**
   * False where the surface's own title row names the item (the phone sheet):
   * that row then carries `HaulingItemActions` too. The flags and lane stay.
   */
  showTitle?: boolean;
  /** Without the title row: actions right-aligned on the flags and lane line (the slide-over's ⋮). */
  laneActions?: ReactNode;
}

/** The item's ⋮, for the detail's title row or a sheet's. */
export function HaulingItemActions({ row }: { row: HaulingViewRow }) {
  return <ItemMoreActions typeId={row.typeId} itemName={row.name} variant="ghost" size="sm" />;
}

const plannedUnits = (line: TripLine | undefined) =>
  line && line.quantity > 0 ? line.quantity : undefined;

export function HaulingItemDetail({
  row,
  line,
  loadNote,
  showTitle = true,
  laneActions,
}: HaulingItemDetailProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Header row={row} showTitle={showTitle} laneActions={laneActions} />
      {row.mode === 'instant' ? (
        <InstantBody row={row} line={line} loadNote={loadNote} />
      ) : (
        <ListingBody row={row} line={line} loadNote={loadNote} />
      )}
      <Links row={row} />
    </div>
  );
}

function Header({
  row,
  showTitle,
  laneActions,
}: {
  row: HaulingViewRow;
  showTitle: boolean;
  laneActions?: ReactNode;
}) {
  const { t } = useTranslation();
  const lane = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-text-dim">
      {row.flags.map((flag) => (
        <HaulingFlagWord key={flag} flag={flag} />
      ))}
      <span className="whitespace-nowrap">
        {t('market.hauling.itemDetail.lane', {
          from: row.fromHub.systemName,
          to: row.toHub.systemName,
        })}
      </span>
    </span>
  );

  if (!showTitle) {
    if (laneActions === undefined) return lane;
    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{lane}</div>
        {laneActions}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3">
      <TypeIcon typeId={row.typeId} size={64} className="size-10 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-start gap-2">
          {/* Plain text, not a link: Show info is a link below and in the ⋮ (DESIGN.md §6c). */}
          <h3 className="min-w-0 flex-1 text-base leading-tight font-semibold break-words">
            {row.name}
          </h3>
          <HaulingItemActions row={row} />
        </div>
        {lane}
      </div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <span className={eyebrowClassName}>{children}</span>;
}

/** Full ISK on every screen, never shorthand: it is the figure typed into EVE. */
function PayAtMost({ row }: { row: HaulingViewRow }) {
  const { t } = useTranslation();
  const limit = maxBuyPrice(row.candidate, row.fees);
  const pct = HAULING_THRESHOLDS.minUnitMarginPct;
  return (
    <div className="flex flex-col gap-0.5 border-t border-line pt-3">
      <Label>{t('market.hauling.itemDetail.payAtMost')}</Label>
      {limit === null ? (
        <span className="text-sm text-text-dim">
          {t('market.hauling.itemDetail.noPayAtMost', { hub: row.fromHub.systemName, pct })}
        </span>
      ) : (
        <>
          <span className="text-xl leading-tight font-semibold whitespace-nowrap tabular-nums">
            {formatMarketIsk(limit)}
          </span>
          <span className="text-xs text-text-dim">
            {t('market.hauling.itemDetail.payAtMostHow', { hub: row.fromHub.systemName, pct })}
          </span>
        </>
      )}
      {/* No unit worth buying: a "+0 profit each" would read as a real figure. */}
      {row.suggestedUnits > 0 && (
        <span
          className={cx(
            'flex flex-wrap gap-x-1.5 pt-1 text-sm font-semibold tabular-nums',
            marketIskTone(row.profitPerUnit)
          )}
        >
          <span className="whitespace-nowrap">
            {t('market.hauling.itemDetail.profitEach', { isk: signedMarketIsk(row.profitPerUnit) })}
          </span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap">
            {t('market.hauling.itemDetail.margin', { pct: formatSignedPct(row.marginPct, 1) })}
          </span>
        </span>
      )}
    </div>
  );
}

interface OrderRow {
  price: number;
  units: number;
  /** Listing: the user's own order. Instant: an order the load sells into. */
  marked: boolean;
}

/** A destination order book as Price / Units, the marked rows tinted. */
function OrderTable({
  title,
  rows,
  markLabel,
  note,
}: {
  title: string;
  rows: OrderRow[];
  /** Said beside a marked row's price ("your listing"); without it a marked row is only tinted. */
  markLabel?: string;
  note?: string;
}) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-1">
      <Label>{title}</Label>
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[0.6875rem] tracking-wider text-text-dim uppercase">
            <th className="py-0.5 font-semibold">{t('market.hauling.detail.colPrice')}</th>
            <th className="py-0.5 text-right font-semibold">
              {t('market.hauling.detail.colUnits')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((level, index) => (
            <tr
              key={`${index}-${level.price}`}
              className={cx('border-t border-line/60', level.marked && 'bg-accent/10')}
            >
              <td className="py-1">
                {level.marked && markLabel ? (
                  <span className="flex flex-wrap items-center gap-x-1.5 font-semibold">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <Icon.MyOrder aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                      {formatMarketIsk(level.price)}
                    </span>
                    <span className="text-xs font-normal whitespace-nowrap text-text-dim">
                      {markLabel}
                    </span>
                  </span>
                ) : (
                  <span className="whitespace-nowrap">{formatMarketIsk(level.price)}</span>
                )}
              </td>
              <td className="py-1 text-right whitespace-nowrap">{level.units.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {note && <p className="text-xs text-text-dim">{note}</p>}
    </section>
  );
}

/**
 * The cheapest orders with your listing among them, after every order at or
 * under its price (those were there first). Orders past `ORDER_LEVELS` show
 * only when your listing sits behind them.
 */
function withYourListing(ladder: readonly LadderLevel[], price: number, units: number): OrderRow[] {
  const found = ladder.findIndex((level) => level.price > price);
  const at = found === -1 ? ladder.length : found;
  const levels = ladder.map(({ price, units }) => ({ price, units, marked: false }));
  const rows = [...levels.slice(0, at), { price, units, marked: true }, ...levels.slice(at)];
  return rows.slice(0, Math.max(ORDER_LEVELS, at) + 1);
}

/** The dearest buy orders, marked where `units` sold in order would fill them. */
function soldInto(ladder: readonly LadderLevel[], units: number): OrderRow[] {
  let before = 0;
  return ladder.slice(0, ORDER_LEVELS).map((level) => {
    const marked = before < units;
    before += level.units;
    return { price: level.price, units: level.units, marked };
  });
}

function LedgerLine({
  label,
  note,
  amount,
  strong = false,
  tone,
}: {
  label: string;
  note?: string;
  amount: string;
  strong?: boolean;
  tone?: 'success' | 'danger';
}) {
  return (
    <div
      className={cx('flex items-baseline gap-2 text-sm tabular-nums', strong && 'font-semibold')}
    >
      <span className={cx('min-w-0', strong ? 'text-text' : 'text-text-dim')}>{label}</span>
      {note && <span className="shrink-0 text-xs text-text-dim">{note}</span>}
      <span
        className={cx(
          'ml-auto shrink-0 whitespace-nowrap',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger'
        )}
      >
        {amount}
      </span>
    </div>
  );
}

function PlanNote({
  row,
  line,
  loadNote,
}: {
  row: HaulingViewRow;
  line: TripLine | undefined;
  loadNote: string | undefined;
}) {
  const { t } = useTranslation();
  const volume = t('market.hauling.volumeEach', {
    m3: row.unitVolumeM3.toLocaleString(undefined, { maximumFractionDigits: 3 }),
  });
  const planned = plannedUnits(line);
  if (planned === undefined) return <p className="text-xs text-text-dim">{volume}</p>;
  const units = t('market.hauling.itemDetail.planUnits', {
    count: planned,
    units: planned.toLocaleString(),
  });
  return (
    <p className="text-xs text-text-dim">
      {t('market.hauling.detail.planNote', {
        volume,
        note: loadNote ? `${units} · ${loadNote}` : units,
      })}
    </p>
  );
}

type Lot = ReturnType<typeof lotEconomics>;

/**
 * Per unit of the load the row's figures are worked on, so the ledger adds up
 * to the row's profit each.
 */
function TheMath({
  row,
  line,
  loadNote,
  lot,
  sellLabel,
  sellEach,
  noneProfitable,
  children,
}: {
  row: HaulingViewRow;
  line: TripLine | undefined;
  loadNote: string | undefined;
  lot: Lot;
  sellLabel: string;
  sellEach: number;
  noneProfitable: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const per = (value: number) => (lot.filled > 0 ? value / lot.filled : 0);
  return (
    <Disclosure
      label={t('market.hauling.itemDetail.showMath')}
      expanded={open}
      onToggle={() => setOpen((was) => !was)}
      className="border-y border-line"
    >
      <div className="flex flex-col gap-1.5 p-3">
        {lot.filled === 0 ? (
          <p className="text-xs text-text-dim">{noneProfitable}</p>
        ) : (
          <>
            <LedgerLine
              label={t('market.hauling.detail.buyIn', { hub: row.fromHub.systemName })}
              amount={`−${formatMarketIsk(per(lot.cost))}`}
            />
            <LedgerLine label={sellLabel} amount={`+${formatMarketIsk(sellEach)}`} />
            <LedgerLine
              label={t('market.hauling.detail.tax')}
              note={`${fixed2(lot.salesTaxPct)}%`}
              amount={`−${formatMarketIsk(per(lot.salesTax))}`}
            />
            {row.mode === 'list' && (
              <LedgerLine
                label={t('market.hauling.detail.broker')}
                note={`${fixed2(lot.brokerFeePct)}%`}
                amount={`−${formatMarketIsk(per(lot.brokerFee))}`}
              />
            )}
            <div className="border-t border-line pt-1.5">
              <LedgerLine
                strong
                tone={row.profitPerUnit >= 0 ? 'success' : 'danger'}
                label={t('market.hauling.itemDetail.profitEachLine')}
                amount={signedMarketIsk(row.profitPerUnit)}
              />
            </div>
          </>
        )}
        <PlanNote row={row} line={line} loadNote={loadNote} />
        {children}
      </div>
    </Disclosure>
  );
}

/**
 * Which of `estimateSale`'s cases set the Expected Sell Price: the lower of
 * the recent sale and one tick under the cheapest listing (the listing itself
 * when no tick fits under it), rounded down only when that wasn't already a
 * valid price.
 */
function whyPriceKey(sale: ListHaulingScanRow['sale']) {
  const tick = sale.undercutPrice < sale.lowestAsk;
  const rounded = sale.price < Math.min(sale.undercutPrice, sale.recentSalePrice);
  if (tick) return rounded ? 'whyTickRounded' : 'whyTick';
  return rounded ? 'whyAskRounded' : 'whyAsk';
}

function ListingBody({
  row,
  line,
  loadNote,
}: {
  row: HaulingViewRow & ListHaulingScanRow;
  line: TripLine | undefined;
  loadNote: string | undefined;
}) {
  const { t } = useTranslation();
  const { sale, toHub: to } = row;
  const lot = lotEconomics({
    buyLadder: row.buyLadder,
    expectedPrice: sale.price,
    quantity: row.suggestedUnits,
    fees: row.fees,
  });

  return (
    <>
      <PayAtMost row={row} />
      <OrderTable
        title={t('market.hauling.detail.ordersTitle', { hub: to.systemName })}
        rows={withYourListing(row.destLadder, sale.price, plannedUnits(line) ?? row.suggestedUnits)}
        markLabel={t('market.hauling.itemDetail.yourListing')}
      />
      <div className="flex flex-col gap-0.5">
        <Label>{t('market.hauling.itemDetail.sellsIn')}</Label>
        {/* Each segment keeps its trailing "·": a wrap falls between segments, never before a dot. */}
        <p className="text-sm text-text-dim">
          <span className="whitespace-nowrap">
            <b className="text-text tabular-nums">
              {t('market.hauling.itemDetail.sellsInDays', {
                count: Math.max(1, Math.round(sale.daysToSell)),
                days: formatDaysToSell(sale.daysToSell),
              })}
            </b>{' '}
            ·
          </span>{' '}
          <span className="whitespace-nowrap">
            {t('market.hauling.itemDetail.soldPerDay', {
              units: sale.dailyVolume.toLocaleString(undefined, { maximumFractionDigits: 1 }),
            })}{' '}
            ·
          </span>{' '}
          <span className="whitespace-nowrap">
            {t('market.hauling.itemDetail.listedNear', { units: sale.unitsAhead.toLocaleString() })}
          </span>
        </p>
        <LastSalesSplit row={row} />
      </div>
      <TheMath
        row={row}
        line={line}
        loadNote={loadNote}
        lot={lot}
        sellLabel={t('market.hauling.detail.sellIn', { hub: to.systemName })}
        sellEach={sale.price}
        noneProfitable={t('market.hauling.itemDetail.noneProfitable')}
      >
        <p className="pt-1.5 text-xs text-text-dim">
          <b className="text-text">
            {t('market.hauling.itemDetail.whyLead', { price: formatMarketIsk(sale.price) })}
          </b>{' '}
          {t(`market.hauling.itemDetail.${whyPriceKey(sale)}`, {
            recent: formatMarketIsk(sale.recentSalePrice),
            undercut: formatMarketIsk(sale.undercutPrice),
          })}
        </p>
        <p className="text-xs text-text-dim">
          {t('market.hauling.detail.regionNote', { hub: to.systemName })}
        </p>
      </TheMath>
    </>
  );
}

function InstantBody({
  row,
  line,
  loadNote,
}: {
  row: HaulingViewRow & InstantHaulingScanRow;
  line: TripLine | undefined;
  loadNote: string | undefined;
}) {
  const { t } = useTranslation();
  const { toHub: to } = row;
  const lot = lotEconomics({
    buyLadder: row.buyLadder,
    expectedPrice: 0,
    quantity: row.suggestedUnits,
    fees: row.fees,
    destBuyLadder: row.destBuyLadder,
  });
  // The plan's quantity when it brings some, else what the row's figures sell.
  const orders = soldInto(row.destBuyLadder, plannedUnits(line) ?? lot.filled);

  return (
    <>
      <PayAtMost row={row} />
      <OrderTable
        title={t('market.hauling.detail.buyOrdersTitle', { hub: to.systemName })}
        rows={orders}
        note={t('market.hauling.itemDetail.buyOrdersNote')}
      />
      <TheMath
        row={row}
        line={line}
        loadNote={loadNote}
        lot={lot}
        sellLabel={t('market.hauling.detail.sellInto', { hub: to.systemName })}
        sellEach={lot.filled > 0 ? lot.revenue / lot.filled : 0}
        noneProfitable={t('market.hauling.detail.noneProfitable')}
      >
        <p className="text-xs text-text-dim">
          {t('market.hauling.detail.instantNote', { hub: to.systemName })}
        </p>
      </TheMath>
    </>
  );
}

/** Show info, the destination's full book and price history, and Route Safety for the lane. */
function Links({ row }: { row: HaulingViewRow }) {
  const { t } = useTranslation();
  return (
    <p className="flex flex-wrap gap-2">
      <MarketItemLink typeId={row.typeId} hubId={row.toHub.id} className={LINK_BUTTON}>
        {t('market.hauling.itemDetail.priceHistory', { hub: row.toHub.systemName })}
      </MarketItemLink>
      <Link to={routeToHref(row.toHub.systemId, row.fromHub.systemId)} className={LINK_BUTTON}>
        {t('market.hauling.itemDetail.routeSafety')}
      </Link>
      <ItemInfoLink typeId={row.typeId} itemName={row.name} className={LINK_BUTTON}>
        {t('market.contextMenu.showInfo')}
      </ItemInfoLink>
    </p>
  );
}

/** Real links (they open a page or the item's info), drawn as ghost buttons; `buttonClassName`'s hover keys on `:enabled`, which an `<a>` never matches. */
const LINK_BUTTON = buttonClassName({
  variant: 'ghost',
  size: 'sm',
  className: 'hover:border-line-bright hover:bg-panel-2 active:bg-panel',
});

/** A day's highest and lowest fill this far apart are two kinds of sale — a listing bought, a dump into a buy order — not one price. */
const SPLIT_RATIO = 0.8;

/** The newest trading day's two kinds of sale, when they differ enough that its average would mislead. */
function LastSalesSplit({ row }: { row: HaulingViewRow & ListHaulingScanRow }) {
  const { t } = useTranslation();
  const day = row.demand.latestDay;
  if (!day || day.lowest >= day.highest * SPLIT_RATIO) return null;
  return (
    <p className="text-xs text-text-dim">
      {t('market.hauling.itemDetail.lastSalesSplit', {
        date: day.date,
        high: formatMarketIsk(day.highest),
        low: formatMarketIsk(day.lowest),
      })}
    </p>
  );
}
