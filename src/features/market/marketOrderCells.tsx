/**
 * The order book table's Location/Security cells. Split out of
 * `useMarketOrderColumns.tsx` (which otherwise carries no component export
 * for Fast Refresh to find) since these are plain render functions, not
 * components — same precedent as `route/jumpsCell.tsx`.
 */
import type { TFunction } from 'i18next';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  resolveOrderLocation,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import { securityStatusColor } from '@/engine/securityStatus';
import type { RegionOrder } from '@/esi/endpoints';

export interface LocationCellProps {
  order: RegionOrder;
  npcStations: ReadonlyMap<number, NpcStationLookup>;
  solarSystems: ReadonlyMap<number, SolarSystemLookup>;
  t: TFunction;
  /** The two-line order card's title: one truncated line, no tooltip underline. */
  card?: boolean;
}

export function LocationCell({
  order,
  npcStations,
  solarSystems,
  t,
  card = false,
}: LocationCellProps) {
  const location = resolveOrderLocation(order, npcStations, solarSystems);
  // Station name alone — an EVE station name already carries its system
  // ("Jita IV - Moon 4 - ..."), so a trailing system/security suffix would
  // repeat a word the eye had just read on every row of the book. The full
  // form survives where it is pasted or exported rather than scanned —
  // `OrderRowContextMenu`'s copy action and `orderBookCsv`.
  if (location.stationName === null) {
    return <span>{t('market.unknownStructure')}</span>;
  }
  // The card's title line: the expanded row carries the full name.
  if (card) return <span className="block truncate">{location.stationName}</span>;
  // `sm:`-scoped: nothing truncates on the phone card, so the underline
  // would mislead there. No `openOnTap` — it reveals nothing new, and
  // `DataTable` treats an `openOnTap` trigger as the row's own click.
  return (
    <Tooltip content={location.stationName}>
      <span
        tabIndex={0}
        className="sm:cursor-help sm:underline sm:decoration-dotted sm:decoration-text-dim/50 sm:underline-offset-2"
      >
        {location.stationName}
      </span>
    </Tooltip>
  );
}

/** Security dropped from `LocationCell` (see above) lives here instead, as its own optional column. */
export function SecurityCell({ order, npcStations, solarSystems, t }: LocationCellProps) {
  const { security } = resolveOrderLocation(order, npcStations, solarSystems);
  const value = security.toFixed(1);
  return (
    <span
      className="tabular-nums font-semibold"
      style={{ color: securityStatusColor(security) }}
      title={t('market.securityAriaLabel', { value })}
    >
      {value}
    </span>
  );
}

/**
 * A sell order priced ten times the best or more (`sellOutlierMultiple`):
 * flagged beside its price rather than hidden, so the book stays complete but
 * the row stops reading as a real offer. A warning icon, so the flag never
 * widens the Price column past the figure; its words are the tooltip and the
 * icon's accessible name, so it is never a colour alone.
 */
export function BaitFlag({ multiple, t }: { multiple: number | null; t: TFunction }) {
  if (multiple === null) return null;
  const times = Math.round(multiple).toLocaleString();
  return (
    <Tooltip content={t('market.baitHint', { times })}>
      <span
        tabIndex={0}
        role="img"
        aria-label={t('market.baitHint', { times })}
        className="mr-1 inline-flex align-text-bottom text-warning"
      >
        <Icon.Warn aria-hidden size={Icon.ICON_SIZE.sm} />
      </span>
    </Tooltip>
  );
}
