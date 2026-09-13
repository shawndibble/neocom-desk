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
 * narrowest track this grid produces (5 across at `xl`) is ~145px of content,
 * and a side-by-side label would start wrapping there while a stacked one
 * never does.
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
    // Three across from `sm` because that is where the paste box is still
    // above the results rather than beside them; five only from `xl`, since
    // below that the results share the row with the 21rem paste column and
    // five tracks would squeeze each card under its own figures.
    //
    // `min-w-0` on the grid and every card: a grid item's default `min-width`
    // is its content's intrinsic width, so without it a long figure widens
    // its track instead of being contained.
    <ul
      aria-label={t('market.appraisal.compareHubsTitle')}
      className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-5"
    >
      {rows.map((row) => (
        <li
          key={row.hub.id}
          className="min-w-0 rounded-xs border border-line bg-panel-2 p-3"
          // The full station name, for the hub a `systemName` alone does not
          // identify to someone new to the game.
          title={row.hub.name}
        >
          <p className="truncate text-sm font-semibold text-text">{row.hub.systemName}</p>
          <dl className="mt-2 flex flex-col gap-2">
            <HubFigure label={t('market.appraisal.columnSellTotal')} value={row.sell} />
            <HubFigure label={t('market.appraisal.columnBuyTotal')} value={row.buy} />
          </dl>
        </li>
      ))}
    </ul>
  );
}
