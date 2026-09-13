/**
 * Compare Hubs as a card per Trade Hub rather than a row per Trade Hub.
 *
 * The table this replaced answered "what is the spread at each hub" only by
 * reading a number out of a column and holding it against the number two rows
 * down. Five hubs is a fixed, tiny set — it fits across the panel — so each
 * hub gets its own box and the comparison becomes a glance across the row
 * instead of a scan down a column.
 *
 * What that trades away is sorting: `DataTable` gave sortable buy/sell
 * columns and a card grid has no column to sort. `TRADE_HUBS`' own fixed
 * order (Jita, Amarr, Dodixie, Rens, Hek) is the order here, at every width,
 * so a hub is always in the same place on the grid — which is the thing a
 * sort would otherwise destroy.
 */
import { useTranslation } from 'react-i18next';
import { IskAmount } from '@/components/ui';
import type { HubComparisonRow } from './appraisalData';

/**
 * One labelled figure inside a card. Label above value, never beside it: the
 * narrowest track this grid produces is ~120px of content, where a
 * side-by-side label would leave the figure nowhere to sit.
 */
function HubFigure({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </dt>
      <dd className="text-base text-text tabular-nums">
        {value === null ? '—' : <IskAmount value={value} revealOn="tap" decimals={0} />}
      </dd>
    </div>
  );
}

export function HubCompareCards({ rows }: { rows: readonly HubComparisonRow[] }) {
  const { t } = useTranslation();

  return (
    // `bg-panel-2` rather than `Panel`: these sit *inside* the Compare Hubs
    // panel, so they are DESIGN.md §1's raised layer on a panel, not a second
    // panel nested in the first.
    //
    // One column on a phone, three from `sm`, all five from `lg` — which is
    // also where the paste box becomes a 21rem sidebar, so the results track
    // narrows at the same breakpoint the card count grows. Five tracks in
    // that ~640px track is ~120px of content each: enough for a compact ISK
    // figure, and a label that wraps to two lines at the very bottom of the
    // range simply makes the row of cards taller rather than breaking.
    //
    // `min-w-0` on the grid and every card: a grid item's default `min-width`
    // is its content's intrinsic width, so without it a long figure widens
    // its track instead of being contained.
    <ul
      aria-label={t('market.appraisal.compareHubsTitle')}
      className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-5"
    >
      {rows.map((row) => (
        <li key={row.hub.id} className="min-w-0 rounded-xs border border-line bg-panel-2 p-3">
          <p className="truncate text-sm font-semibold text-text">{row.hub.systemName}</p>
          <dl className="mt-2 flex flex-col gap-2">
            <HubFigure label={t('market.appraisal.sellTotal')} value={row.sell} />
            <HubFigure label={t('market.appraisal.buyTotal')} value={row.buy} />
          </dl>
        </li>
      ))}
    </ul>
  );
}
