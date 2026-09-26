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
 * count rather than a bar to interpret.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppraisalNetFees } from '@/engine/market/appraisal';
import { HAULING_THRESHOLDS, lotEconomics } from '@/engine/market/haulingMarket';
import { formatIsk } from '@/lib/isk';
import type { TradeHub } from '@/market/hubs';
import { formatDaysToSell, type HaulingViewRow } from './haulingView';

const ORDER_LEVELS = 8;

interface HaulingRowDetailProps {
  row: HaulingViewRow;
  from: TradeHub;
  to: TradeHub;
  fees: AppraisalNetFees;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {title}
      </h4>
      {children}
    </section>
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

export function HaulingRowDetail({ row, from, to, fees }: HaulingRowDetailProps) {
  const { t } = useTranslation();
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
    <div className="flex flex-col gap-4 bg-panel-2/40 p-4">
      <div>
        <h3 className="text-base font-semibold">
          {t('market.hauling.detail.title', { item: row.name, hub: to.systemName })}
        </h3>
        <p className="text-xs text-text-dim">
          {t('market.hauling.detail.regionNote', { hub: to.systemName })}
        </p>
      </div>

      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Section title={t('market.hauling.detail.priceTitle')}>
            <p className="text-xs text-text-dim">{t('market.hauling.detail.priceLowerOf')}</p>
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

          <Section title={t('market.hauling.detail.speedTitle')}>
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
            {listedDiffers && (
              <p className="text-xs text-text-dim">
                {t('market.hauling.detail.listedOnlyGap', {
                  listed: each(listedOnlyEach),
                  ours: each(row.profitPerUnit),
                })}
              </p>
            )}
          </Section>

          <Section title={t('market.hauling.detail.ordersTitle', { hub: to.systemName })}>
            <table className="w-full text-sm tabular-nums">
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
                  if (index === markerAt) rows.push(<MarkerRow key="marker" price={sale.price} />);
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
            <p className="text-xs text-text-dim">{t('market.hauling.detail.ordersNote')}</p>
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
