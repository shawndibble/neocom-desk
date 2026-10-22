/**
 * The proposed Compare drawer with a third view, Trade hubs (issue #4696).
 * The drawer chrome repeats today's `CompareDrawer` markup (header, segmented
 * view switch, Expand / Clear all / close) so the picture matches what ships;
 * only the Trade hubs table and its cell are new.
 */
import { Link } from 'react-router-dom';
import {
  Button,
  DataTable,
  IconButton,
  SegmentedControl,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { controlHeightClassName, inlineLinkClassName } from '@/components/ui/controlStyles';
import { Caret } from '@/components/ui/Disclosure';
import { RemovableTypeIcon } from '@/features/market/RemovableTypeIcon';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { formatMarketIsk } from '@/lib/isk';
import { cx } from '@/lib/cx';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { NewComponent } from './NewComponent';
import {
  HUB_JUMPS,
  HUB_QUOTES,
  type HubQuote,
  type SampleCompareItem,
} from './compareTradeHubsFixtures';

type HubId = TradeHub['id'];

/** The pilot's saved Market hub, marked in its column header. */
const OWN_HUB: HubId = 'jita';

interface HubRow extends SampleCompareItem {
  quotes: Readonly<Record<HubId, HubQuote>>;
  /** Hub with the row's cheapest sell / highest buy (none if only one hub quotes). */
  bestSellHub: HubId | null;
  bestBuyHub: HubId | null;
}

function bestHub(
  quotes: Readonly<Record<HubId, HubQuote>>,
  side: 'sell' | 'buy',
  loading: ReadonlySet<HubId>
): HubId | null {
  let best: HubId | null = null;
  let bestValue: number | null = null;
  for (const hub of TRADE_HUBS) {
    if (loading.has(hub.id)) continue;
    const value = quotes[hub.id][side];
    if (value === null) continue;
    const better = bestValue === null || (side === 'sell' ? value < bestValue : value > bestValue);
    if (better) {
      best = hub.id;
      bestValue = value;
    }
  }
  return best;
}

/**
 * Short enough to be the phone card's gutter label too: "Amarr · 12j". The
 * own hub is named in the drawer's subtitle and its header is accent.
 */
function hubHeader(hub: TradeHub): string {
  return `${hub.systemName} · ${HUB_JUMPS[hub.id]}j`;
}

const OWN_HUB_NAME = TRADE_HUBS.find((hub) => hub.id === OWN_HUB)!.systemName;

/** A best figure carries the word, not just the colour (DESIGN.md "New since last time" rule). */
function BestTag({ children }: { children: string }) {
  return (
    <span className="ml-1.5 text-[0.625rem] font-semibold tracking-wide text-success uppercase">
      {children}
    </span>
  );
}

/**
 * One hub's quote for one item: best sell as the cell's one link (a figure
 * link, DESIGN.md §6c "Item names": accent, solid underline, into the Market
 * browser at that hub), best buy dim beneath it.
 */
function TradeHubCell({ row, hub, loading }: { row: HubRow; hub: TradeHub; loading: boolean }) {
  if (loading) return <span className="text-text-dim">…</span>;
  const quote = row.quotes[hub.id];
  const isBestSell = row.bestSellHub === hub.id;
  const isBestBuy = row.bestBuyHub === hub.id;
  return (
    <span className="inline-flex flex-col items-end gap-0.5 tabular-nums">
      <span className="whitespace-nowrap">
        {quote.sell === null ? (
          <span className="text-text-dim">No sellers</span>
        ) : (
          <Link
            to={`/market/browser?type=${row.typeId}&hub=${hub.id}`}
            aria-label={`${row.itemName} at ${hub.systemName}: best sell ${formatMarketIsk(quote.sell)}`}
            className={cx(inlineLinkClassName, isBestSell && 'text-success')}
          >
            {formatMarketIsk(quote.sell)}
          </Link>
        )}
        {isBestSell && <BestTag>Lowest</BestTag>}
      </span>
      <span className="text-[0.6875rem] whitespace-nowrap text-text-dim">
        buy {quote.buy === null ? '—' : formatMarketIsk(quote.buy)}
        {isBestBuy && <BestTag>Highest</BestTag>}
      </span>
    </span>
  );
}

export function TradeHubsTable({
  items,
  loadingHubs = [],
  narrow = false,
}: {
  items: readonly SampleCompareItem[];
  loadingHubs?: readonly HubId[];
  narrow?: boolean;
}) {
  const loading = new Set(loadingHubs);
  const rows: HubRow[] = items.map((item) => {
    const quotes = HUB_QUOTES[item.typeId];
    return {
      ...item,
      quotes,
      bestSellHub: bestHub(quotes, 'sell', loading),
      bestBuyHub: bestHub(quotes, 'buy', loading),
    };
  });
  const columns: DataTableColumn<HubRow>[] = [
    {
      id: 'item',
      header: 'Item',
      stickyStart: true,
      sortValue: (row) => row.itemName,
      render: (row) => (
        <span className="flex items-center gap-2.5">
          <RemovableTypeIcon
            typeId={row.typeId}
            itemName={row.itemName}
            onRemove={() => {}}
            sizeClassName="size-6"
          />
          <MarketItemLink typeId={row.typeId}>{row.itemName}</MarketItemLink>
        </span>
      ),
    },
    ...TRADE_HUBS.map((hub): DataTableColumn<HubRow> => ({
      id: hub.id,
      header: hubHeader(hub),
      headerTooltip: `${HUB_JUMPS[hub.id]} jumps from you${hub.id === OWN_HUB ? ' · your Market hub' : ''}`,
      headerClassName: hub.id === OWN_HUB ? 'text-accent' : undefined,
      align: 'right',
      render: (row) => <TradeHubCell row={row} hub={hub} loading={loading.has(hub.id)} />,
      sortValue: (row) => row.quotes[hub.id].sell ?? undefined,
    })),
  ];
  return (
    <NewComponent name="TradeHubsTable">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.typeId}
        label="Compare at trade hubs"
        responsive={narrow ? 'stack' : 'table'}
      />
    </NewComponent>
  );
}

/**
 * Today's drawer chrome, open on the proposed third view. `fullScreen` is the
 * phone sheet, as today below `md`.
 */
export function ProposedCompareDrawer({
  items,
  loadingHubs,
  fullScreen = false,
  note,
}: {
  items: readonly SampleCompareItem[];
  loadingHubs?: readonly HubId[];
  fullScreen?: boolean;
  /** An annotation for an open question, shown above the table. */
  note?: string;
}) {
  const count = `Compare (${items.length})`;
  return (
    <div
      className={`fixed inset-x-0 bottom-16 flex flex-col-reverse items-stretch md:bottom-0 ${fullScreen ? 'z-50' : 'z-40'}`}
    >
      <button
        type="button"
        className={`flex ${controlHeightClassName.md} items-center justify-center gap-1.5 border border-line bg-panel px-4 text-[0.6875rem] font-semibold tracking-widest text-text uppercase`}
      >
        <Caret expanded />
        {count}
      </button>
      <section
        aria-label="Compare"
        style={fullScreen ? undefined : { height: 380 }}
        className={`flex flex-col border-line bg-panel ${fullScreen ? 'fixed inset-0 h-dvh' : 'border border-b-0'}`}
      >
        {!fullScreen && <div className="h-1.5 shrink-0 border-b border-line" />}
        <header className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-line bg-panel-2 px-3 py-1 md:min-h-9">
          <div className="flex items-center gap-2">
            <h2 className={eyebrowClassName}>{count}</h2>
            <SegmentedControl
              label="Compare view"
              options={[
                { value: 'prices', label: 'Prices' },
                // Three options overflow a 390px header: the phone says "Hubs".
                { value: 'hubs', label: fullScreen ? 'Hubs' : 'Trade hubs' },
                { value: 'attributes', label: 'Attributes' },
              ]}
              value="hubs"
              onChange={() => {}}
            />
            {!fullScreen && (
              <span className="text-[0.6875rem] text-text-dim">
                Best sell over best buy at each hub&apos;s station · your hub: {OWN_HUB_NAME}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!fullScreen && (
              <>
                <Button size="sm">Expand</Button>
                <Button size="sm">Clear all</Button>
              </>
            )}
            <IconButton size="sm" icon={<Icon.Close />} label="Close" />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {fullScreen && (
            <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-text-dim">
              Best sell over best buy at each hub&apos;s station · your hub: {OWN_HUB_NAME}
            </p>
          )}
          {note && (
            <p className="border-b border-line bg-panel-2 px-3 py-2 text-xs text-warning">{note}</p>
          )}
          <div className="overflow-x-auto p-1">
            <TradeHubsTable items={items} loadingHubs={loadingHubs} narrow={fullScreen} />
          </div>
        </div>
      </section>
    </div>
  );
}
