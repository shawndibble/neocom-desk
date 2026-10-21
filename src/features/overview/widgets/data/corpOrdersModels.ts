/**
 * Corp market orders builder: the corporation's open orders, the ISK held in
 * escrow and how many are undercut. The rows come from the character Orders
 * engine (`buildOpenOrderRows`), so a corp order is judged by the same
 * undercut rules; only the data behind it differs. Pure, derived at render
 * time. ESI caches the list for 1200 s, and the table shows orders by the
 * day, so no countdown finer than that is drawn.
 */
import {
  buildOpenOrderRows,
  type OpenOrderRow,
  openOrderProblemCounts,
  notCheckedCount,
} from '@/features/market/openOrdersModel';
import { formatIskCompact } from '@/lib/isk';
import { blank, corpUnreadable, count, statusOf, type Builder } from './builderKit';
import type { CorpOrdersFeed } from './corpFeeds';
import { ordersListed, ordersTable } from './ordersModels';

const C = 'overview.widgets.corpOrders';
/** The Market orders page's Corp view. */
const TO = '/market/orders?scope=corp';

/**
 * The corporation's open orders as Orders-page rows, judged by the character
 * undercut rules. Shared by the widget and the Market orders Corp view, so the
 * two never disagree on what is undercut.
 */
export function corpOrderRows(data: CorpOrdersFeed, now: number): OpenOrderRow[] {
  return buildOpenOrderRows({
    snapshot: {
      entries: [
        {
          // One synthetic owner: the corporation. Cost basis and skills are per Character.
          characterId: 0,
          characterName: '',
          orders: data.orders.map((order) => ({ ...order, is_corporation: true })),
          fetchedAt: data.fetchedAt?.getTime() ?? 0,
          fromCache: data.fromCache,
          needsReauth: false,
        },
      ],
      skipped: [],
    },
    typeNames: data.typeNames,
    stationPrices: data.stationPrices,
    costBases: new Map(),
    stationNames: data.stationNames,
    skillsByCharacter: new Map(),
    now,
  });
}

export const corpOrders: Builder = (feeds, { t, now }) => {
  const feed = feeds.corpOrders;
  const data = feed?.data ?? null;
  if (!data) return blank(TO, statusOf(feed));
  if (!data.readable) return corpUnreadable(TO, feed, data.needsReauth, t);

  const rows = corpOrderRows(data, now);
  const counts = openOrderProblemCounts(rows);
  const undercut = counts.undercutStation + counts.undercutSystem + counts.undercutRegion;
  const unchecked = notCheckedCount(rows);
  const escrow = data.orders.reduce((sum, order) => sum + (order.escrow ?? 0), 0);
  const listed = ordersListed(rows);
  const issuedBy = new Map(
    data.orders.map((order) => [order.order_id, data.issuerNames.get(order.issued_by ?? 0) ?? ''])
  );
  for (const [id, name] of issuedBy) if (name === '') issuedBy.delete(id);

  return {
    ...blank(TO, statusOf(feed, { isEmpty: rows.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: count(rows.length),
      unit: t(`${C}.unit`, { count: rows.length }),
      secondary:
        escrow > 0
          ? { text: t(`${C}.escrow`, { isk: formatIskCompact(escrow) }) }
          : listed > 0
            ? { text: t(`${C}.listed`, { isk: formatIskCompact(listed) }) }
            : undefined,
      notes:
        unchecked > 0 ? [t('overview.widgets.orders.notChecked', { count: unchecked })] : undefined,
      tone: undercut > 0 ? 'warning' : 'clear',
    },
    rows: [],
    table: ordersTable(t, rows, now, null, issuedBy),
    summary: t(`${C}.summary`, { count: rows.length, undercut }),
  };
};
