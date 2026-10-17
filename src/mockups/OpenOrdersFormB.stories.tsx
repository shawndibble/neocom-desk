import { useState, type ReactElement, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  DataTable,
  Disclosure,
  FilterBar,
  FilterChip,
  InfoTooltip,
  IskAmount,
  MenuItem,
  Modal,
  Panel,
  ProgressBar,
  RowActionsMenu,
  SearchInput,
  SlideOver,
  StatChip,
  StatChips,
  TabPanel,
  Tabs,
  useTabsId,
  type DataTableColumn,
} from '@/components/ui';
import { CopyToClipboard, Refresh } from '@/components/ui/icons';
import { CharacterBadge } from '@/features/character/assetBrowserRows';
import { CopyablePrice } from '@/features/market/CopyablePrice';
import { OrderProblemBadge, type OrderBadgeKind } from '@/features/market/OrderProblemBadge';
import { formatIsk, formatMarketIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { NewComponent } from './NewComponent';
import { OpenOrdersChrome } from './OpenOrdersChrome';
import {
  ACT,
  CHARACTERS,
  FOCUS,
  ORDERS,
  SORTED,
  type MockOrder,
  type OrderState,
  OPEN_ORDERS_SHELL,
} from './openOrdersSample';

/**
 * Form B, "Clean table + side panel" (after Revolut Business FX orders and
 * Coinbase order management). The page is three counts, a search box with
 * one Filters funnel, a row of problem chips with counts, and one flat table,
 * worst first, five columns and no sentences. A row click opens the order in
 * a non-modal side panel on the right (the page behind stays live, the row
 * stays highlighted); on a phone the same body is a full-height sheet. The
 * panel leads with the one price to type, then Overview / Competition /
 * Cost & exits tabs of grouped key-value cards.
 *
 * New components in this mockup: `OrderHeadline` (the price to type, its
 * status and one line of why), `OrderKeyValueCards` (Revolut-style grouped
 * label/value cards), `ScopeRivalList` (who is cheaper at station, system,
 * region), `CostLedger` (where the floor comes from), `ExitsList` (the ways
 * out, ISK a unit each). Everything else is an existing primitive or an
 * existing Market component (`OrderProblemBadge`, `CopyablePrice`,
 * `CharacterBadge`).
 *
 * Where it went:
 * - 8 problem-group headers → one row of `FilterChip`s with counts; Healthy off by default.
 * - Each group's hint line ("Buyers at your station see a cheaper order…") → that chip's tooltip.
 * - Group ISK listed / worst gap / per-Character count → ISK listed `StatChip`; the gap is each row's
 *   status pill; Character is the badge on each row and a filter in the funnel.
 * - Header line (Characters · orders · need attention) → the `StatChips` row.
 * - Notice stack (re-auth, base standings, cached data, not shared) → one folded "Notes" `Disclosure`
 *   under the toolbar; a re-auth banner would still show unfolded.
 * - Filter bar's long list (side, Character, location, expiry, size, cost basis, sort) → the funnel.
 * - Columns picker → gone: five fixed columns, nothing left to switch off.
 * - Where column → muted short name under the item (subtitle in the panel); full station name on
 *   the Overview "Station" row.
 * - "Never sell below" help text → the "?" on the Overview floor row. Exit "relist at" price stays
 *   copyable on the Cost & exits tab.
 * - Problem cell sentence + copy button → panel headline (verdict line + the copyable price).
 * - Floor column → Overview "Never sell below" card (copyable) and Cost & exits ledger.
 * - Refresh, Export and data age → page header.
 * - "Refresh system & region prices" per group → "Check system & region" on the Competition tab.
 * - "What do these badges mean?" → chip tooltips, plus the badge's own "?" in the panel headline.
 * - Modal Quick answer → panel headline. "The numbers" → Overview cards. "Who is cheaper" →
 *   Competition tab. "Where that price comes from" and "Is there a better exit?" → Cost & exits tab.
 */

const PANEL_TITLE = 'Open orders';

const FLOOR_HELP =
  "Change an order's price and you pay the broker fee all over again (discounted by your Relist Discount), so this is the lowest price worth editing to. Leave the order alone and it sells, the fee is already paid, so you break even a little lower.";

/** The chips that replace today's group headers, worst first. */
const CHIPS: { id: string; label: string; states: OrderState[]; hint: string }[] = [
  {
    id: 'belowFloor',
    label: 'Below floor',
    states: ['belowFloor'],
    hint: 'These lose money every time one sells. Put the price up, or accept it.',
  },
  {
    id: 'undercutHere',
    label: 'Undercut here',
    states: ['undercutStation'],
    hint: 'Buyers at your station see a cheaper order before yours.',
  },
  {
    id: 'outbid',
    label: 'Outbid',
    states: ['outbid'],
    hint: 'Someone bids higher on your buy order, so sellers go to them first.',
  },
  {
    id: 'expiring',
    label: 'Expiring',
    states: ['expiring'],
    hint: 'These run out soon with stock left, or have not sold in a while.',
  },
  {
    id: 'undercutElsewhere',
    label: 'Undercut elsewhere',
    states: ['undercutSystem', 'undercutRegion'],
    hint: 'Your station still leads. Cheaper stock is in another station or a few jumps away.',
  },
  {
    id: 'notChecked',
    label: 'Not checked',
    states: ['notChecked'],
    hint: "Market prices couldn't be loaded, so we can't say whether anyone beats these.",
  },
  {
    id: 'healthy',
    label: 'Healthy',
    states: ['healthy'],
    hint: 'Nothing wrong here. Nobody beats your price.',
  },
];

const badgeKind = (order: MockOrder): OrderBadgeKind =>
  order.state === 'healthy' ? (order.side === 'buy' ? 'topBid' : 'best') : order.state;

/** The tightest rival that actually beats this order, if any. */
const bestRival = (order: MockOrder) => order.rivals.find((rival) => rival.seller !== '');

const sideLabel = (order: MockOrder) => (order.side === 'buy' ? 'Buy' : 'Sell');

const count = (value: number) => value.toLocaleString('en-US');

function columns(stacked: boolean): DataTableColumn<MockOrder>[] {
  return [
    {
      id: 'item',
      header: 'Item',
      primary: true,
      sortValue: (row) => row.item,
      render: (row) => (
        <>
          <span className="font-medium text-accent">{row.item}</span>
          <span className="whitespace-nowrap">
            <CharacterBadge characterName={row.character} />
          </span>
          {!stacked && (
            <span className="block text-xs text-text-dim">
              {row.stationShort} · {sideLabel(row)}
              {row.offHub ? ' · Off hub' : ''}
            </span>
          )}
        </>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cardCorner: true,
      className: 'whitespace-nowrap',
      render: (row) => (
        <OrderProblemBadge kind={badgeKind(row)} detail={row.badgeDetail} interactive={false} />
      ),
    },
    {
      id: 'price',
      header: 'Price',
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      sortValue: (row) => row.price,
      render: (row) => {
        const rival = bestRival(row);
        if (stacked) return formatMarketIsk(row.price);
        return (
          <>
            <span className="block">{formatMarketIsk(row.price)}</span>
            {rival && (
              <span className="block text-xs text-text-dim max-lg:hidden">
                {row.side === 'buy' ? 'top bid' : 'cheapest'} {formatMarketIsk(rival.price)}
              </span>
            )}
          </>
        );
      },
    },
    {
      id: 'remaining',
      header: 'Remaining',
      align: 'right',
      // Below lg (a laptop with the rail open) it gives way; Overview has it.
      className: 'tabular-nums whitespace-nowrap max-lg:hidden',
      headerCellClassName: 'max-lg:hidden',
      sortValue: (row) => row.remain / row.total,
      // The dense phone card leaves this off its meta line: Overview has it.
      render: (row) => (
        <span data-dense-omit className="ml-auto block w-28 max-w-full">
          {count(row.remain)} / {count(row.total)}
          <ProgressBar
            label={`${row.item} volume left`}
            value={row.remain}
            max={row.total}
            size="xs"
            className="mt-1"
          />
        </span>
      ),
    },
    {
      id: 'expires',
      header: 'Expires',
      align: 'right',
      className: 'tabular-nums whitespace-nowrap',
      stackAffix: { after: ' left' },
      cellClassName: (row) => (row.expiresDays <= 3 ? 'text-warning' : undefined),
      sortValue: (row) => row.expiresDays,
      render: (row) => `${row.expiresDays}d`,
    },
  ];
}

function RowMenu({ row, children }: { row: MockOrder; children: ReactElement }) {
  return (
    <RowActionsMenu
      name={row.item}
      items={
        <>
          <MenuItem onSelect={() => {}}>View in Market</MenuItem>
          <MenuItem onSelect={() => {}}>Set price alert…</MenuItem>
          <MenuItem onSelect={() => {}}>Add stock target…</MenuItem>
          <MenuItem onSelect={() => {}}>Show info</MenuItem>
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}

/* ----------------------------- Detail body ------------------------------ */

function KeyValue({
  label,
  help,
  children,
  note,
}: {
  label: string;
  /** Plain-language explanation of the label, as a "?" beside it. */
  help?: string;
  children: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-3 py-2.5">
      <span className="inline-flex shrink-0 items-center gap-1 text-sm text-text-dim">
        {label}
        {help && <InfoTooltip label={`About ${label}`} content={help} />}
      </span>
      <span className="min-w-0 text-right text-sm tabular-nums">
        {children}
        {note && <span className="block text-xs text-text-dim">{note}</span>}
      </span>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-line rounded-sm border border-line bg-panel-2">{children}</div>
  );
}

function OrderHeadline({ order }: { order: MockOrder }) {
  const price = order.nextPrice ?? order.price;
  return (
    <NewComponent name="OrderHeadline">
      <div className="space-y-2">
        <span className="block text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {order.nextPrice ? 'New price' : 'Your price'}
        </span>
        <CopyablePrice price={price}>
          <span className="inline-flex items-center gap-2 text-3xl font-semibold tabular-nums">
            {formatMarketIsk(price)}
            <CopyToClipboard className="size-5 text-text-dim" />
          </span>
        </CopyablePrice>
        <div className="flex flex-wrap items-center gap-2">
          <OrderProblemBadge kind={badgeKind(order)} detail={order.badgeDetail} />
          <span className="text-sm font-medium">{order.verdict}</span>
        </div>
        <p className="text-sm text-text-dim">{order.verdictDetail}</p>
      </div>
    </NewComponent>
  );
}

function OverviewTab({ order }: { order: MockOrder }) {
  return (
    <div className="space-y-3">
      <NewComponent name="OrderKeyValueCards">
        <div className="space-y-3">
          <Card>
            <KeyValue label="Your price">{formatMarketIsk(order.price)}</KeyValue>
            <KeyValue label="Station">{order.station}</KeyValue>
            <KeyValue label="Rank at station">{order.rankAtStation.replace(/^rank /, '')}</KeyValue>
            {order.netPerUnit !== undefined && (
              <KeyValue
                label="You keep a unit"
                note={
                  order.nextPrice
                    ? `after fees at ${formatMarketIsk(order.nextPrice)}`
                    : 'after fees'
                }
              >
                <span className={order.netPerUnit < 0 ? 'text-isk-neg' : 'text-isk-pos'}>
                  {formatMarketIsk(order.netPerUnit)}
                </span>
              </KeyValue>
            )}
          </Card>
          <Card>
            <KeyValue label="Sells out in" note={order.perDay || undefined}>
              {order.sellsOutIn}
            </KeyValue>
            <KeyValue
              label="Volume left"
              note={
                <ProgressBar
                  label="Volume left"
                  value={order.remain}
                  max={order.total}
                  size="xs"
                  surface="panel-2"
                  className="mt-1 ml-auto w-28"
                />
              }
            >
              {count(order.remain)} / {count(order.total)}
            </KeyValue>
            <KeyValue label="Listed value">
              <IskAmount value={order.iskTiedUp} />
            </KeyValue>
            <KeyValue label="Expires" note={`${order.expiresDays} days · issued ${order.issuedOn}`}>
              {order.expiresOn}
            </KeyValue>
          </Card>
          {order.floor !== undefined && (
            <Card>
              <KeyValue label="Never sell below" help={FLOOR_HELP}>
                <CopyablePrice price={order.floor} />
              </KeyValue>
              <KeyValue label="Floor comes from">
                {order.floorSource === 'build' ? 'Your build cost' : 'Your wallet buys'}
              </KeyValue>
            </Card>
          )}
        </div>
      </NewComponent>
      <Button>View in Market</Button>
    </div>
  );
}

function CompetitionTab({ order }: { order: MockOrder }) {
  return (
    <div className="space-y-3">
      <NewComponent name="ScopeRivalList">
        {order.rivals.length === 0 ? (
          <p className="text-sm text-text-dim">Not checked: market prices could not load.</p>
        ) : (
          <Card>
            {order.rivals.map((rival) => (
              <div key={rival.scope} className="space-y-0.5 px-3 py-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium">{rival.scope}</span>
                  <span className="tabular-nums">
                    {rival.seller ? formatMarketIsk(rival.price) : 'Nobody beats you'}
                  </span>
                </div>
                {rival.seller && (
                  <div className="flex items-baseline justify-between gap-4 text-xs text-text-dim">
                    <span className="min-w-0 truncate">
                      {rival.seller} · {rival.distance}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      over by {formatMarketIsk(rival.overByIsk)} ({rival.overByPct}%)
                    </span>
                  </div>
                )}
                {rival.seller && (
                  <div className="text-xs text-text-dim">
                    {rival.sellersUnder} sellers, {count(rival.unitsUnder)} units under you
                  </div>
                )}
              </div>
            ))}
          </Card>
        )}
      </NewComponent>
      <Button>
        <Refresh className="size-4" /> Check system & region
      </Button>
    </div>
  );
}

function CostExitsTab({ order }: { order: MockOrder }) {
  return (
    <div className="space-y-3">
      <NewComponent name="CostLedger">
        {order.costPerUnit === undefined ? (
          <p className="text-sm text-text-dim">We don't know what this cost you.</p>
        ) : (
          <Card>
            <KeyValue label="Cost per unit">{formatIsk(order.costPerUnit, 2)}</KeyValue>
            <KeyValue label="Sales tax">{formatIsk(order.salesTax ?? 0, 2)}</KeyValue>
            <KeyValue label="Broker fee (relist discount)">
              {formatIsk(order.brokerFee ?? 0, 2)}
            </KeyValue>
            {order.floor !== undefined && (
              <KeyValue label="Never sell below">
                <span className="font-semibold">{formatIsk(order.floor, 2)}</span>
              </KeyValue>
            )}
          </Card>
        )}
      </NewComponent>
      <NewComponent name="ExitsList">
        {order.exits.length === 0 ? (
          <p className="text-sm text-text-dim">No other way out worth showing.</p>
        ) : (
          <Card>
            {order.exits.map((exit) => (
              <KeyValue
                key={exit.label}
                label={exit.label}
                note={
                  exit.detail?.startsWith('relist at') && order.nextPrice ? (
                    <>
                      relist at <CopyablePrice price={order.nextPrice} />
                    </>
                  ) : (
                    exit.detail
                  )
                }
              >
                <span className={exit.netPerUnit < 0 ? 'text-isk-neg' : 'text-isk-pos'}>
                  {formatMarketIsk(exit.netPerUnit)}
                </span>{' '}
                a unit
              </KeyValue>
            ))}
          </Card>
        )}
      </NewComponent>
    </div>
  );
}

function OrderDetailBody({ order }: { order: MockOrder }) {
  const tabsId = useTabsId();
  const [tab, setTab] = useState('overview');
  return (
    <div className="space-y-4">
      <OrderHeadline order={order} />
      <Tabs
        tabsId={tabsId}
        label="Order detail"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'competition', label: 'Competition' },
          { id: 'cost', label: 'Cost & exits' },
        ]}
      />
      <TabPanel tabsId={tabsId} tabId={tab}>
        {tab === 'overview' && <OverviewTab order={order} />}
        {tab === 'competition' && <CompetitionTab order={order} />}
        {tab === 'cost' && <CostExitsTab order={order} />}
      </TabPanel>
    </div>
  );
}

const detailSubtitle = (order: MockOrder) =>
  `${order.character} · ${order.stationShort} · ${sideLabel(order)}`;

/* --------------------------------- Page --------------------------------- */

interface Filters {
  side: 'all' | 'sell' | 'buy';
}

function OpenOrdersPage({ initialSelected = null }: { initialSelected?: number | null }) {
  const isPhone = useIsPhone();
  const wide = useMediaQuery('(min-width: 80rem)');
  const [selectedId, setSelectedId] = useState<number | null>(initialSelected);
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CHIPS.map((chip) => [chip.id, chip.id !== 'healthy']))
  );
  const [notesOpen, setNotesOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({ side: 'all' });

  const selected = ORDERS.find((order) => order.id === selectedId) ?? null;
  const panelOpen = selected !== null && !isPhone;
  // From xl the table makes room for the panel; below that the panel lies
  // over the right of the table, leaving the item names (and the highlighted
  // row) in view to click the next order.
  const makeRoom = panelOpen && wide;

  const visibleStates = new Set(CHIPS.filter((chip) => on[chip.id]).flatMap((chip) => chip.states));
  const rows = SORTED.filter((order) => visibleStates.has(order.state));
  const totalListed = ORDERS.reduce((sum, order) => sum + order.iskTiedUp, 0);

  return (
    <div className={`space-y-3 px-4 py-4 ${makeRoom ? 'pr-[26rem]' : ''}`}>
      <OpenOrdersChrome />
      <Panel title={PANEL_TITLE} padded={false}>
        <div className="space-y-3 p-3">
          <StatChips>
            <StatChip label="Orders" value={ORDERS.length} />
            <StatChip label="Need attention" value={ACT.length} tone="warning" emphasis />
            <StatChip label="ISK listed" value={<IskAmount value={totalListed} />} />
          </StatChips>
          <FilterBar
            value={filters}
            onChange={setFilters}
            activeCount={0}
            search={
              <SearchInput
                className="min-w-0 flex-1"
                value=""
                onChange={() => {}}
                placeholder="Search item or station…"
                aria-label="Search orders"
              />
            }
          >
            {() => (
              <p className="text-sm text-text-dim">
                Side, Character ({CHARACTERS.map((c) => c.name).join(', ')}), location, expires
                within, minimum ISK listed, cost basis and sort.
              </p>
            )}
          </FilterBar>
          <div className="relative -mx-3 min-w-0 overflow-x-auto px-3">
            <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
              {CHIPS.map((chip) => (
                <FilterChip
                  key={chip.id}
                  className="shrink-0"
                  label={chip.label}
                  count={ORDERS.filter((order) => chip.states.includes(order.state)).length}
                  countLabel={`${ORDERS.filter((order) => chip.states.includes(order.state)).length} orders`}
                  selected={on[chip.id]}
                  onToggle={() => setOn((prev) => ({ ...prev, [chip.id]: !prev[chip.id] }))}
                  tooltip={chip.hint}
                />
              ))}
            </div>
          </div>
          <Disclosure
            label="2 notes"
            expanded={notesOpen}
            onToggle={() => setNotesOpen((open) => !open)}
          >
            <p className="px-3 py-2 text-xs text-text-dim">
              Orsa Tellemar's floor assumes base standings: add her standings for a closer figure.
            </p>
            <p className="px-3 py-2 text-xs text-text-dim">
              Showing saved orders from 4 min ago while EVE is slow to answer.
            </p>
          </Disclosure>
        </div>
        <DataTable
          label="Open orders, worst first"
          columns={columns(isPhone)}
          rows={rows}
          rowKey={(row) => row.id}
          density="compact"
          stackLayout="dense"
          className="dt-actions-pinned-only"
          selectedRowKey={selectedId}
          onRowClick={(row) => setSelectedId(row.id)}
          rowContextMenu={(row, tr) => <RowMenu row={row}>{tr}</RowMenu>}
          rowMoreActions
        />
        <div className="px-3 py-2 text-xs text-text-dim">
          Showing {rows.length} of {ORDERS.length} orders
          {on.healthy ? '' : ` · ${ORDERS.length - rows.length} healthy hidden`}
        </div>
      </Panel>

      {selected && !isPhone && (
        <SlideOver
          open
          onClose={() => setSelectedId(null)}
          title={selected.item}
          subtitle={detailSubtitle(selected)}
        >
          <OrderDetailBody order={selected} />
        </SlideOver>
      )}
      {selected && isPhone && (
        <Modal
          open
          placement="sheet-full"
          onClose={() => setSelectedId(null)}
          title={selected.item}
        >
          <p className="mb-3 text-xs text-text-dim">{detailSubtitle(selected)}</p>
          <OrderDetailBody order={selected} />
        </Modal>
      )}
    </div>
  );
}

const meta = {
  title: 'mockups/Open Orders Form B',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: OPEN_ORDERS_SHELL },
  render: () => <OpenOrdersPage />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { globals: { viewport: { value: 'mobile1', isRotated: false } } };

/** @summary Counts, search + one Filters funnel, problem chips with counts (Healthy off), and one flat five-column table, worst first. */
export const Page: Story = {};

/** @summary Phone: the chips scroll sideways in their own row; the table is two-line cards (item + status / price + expires). */
export const PagePhone: Story = { ...phone };

/** @summary The undercut Shield Extender open in the right side panel: price to type, status, Overview cards; its row stays highlighted. New components: OrderHeadline, OrderKeyValueCards. */
export const Detail: Story = {
  render: () => <OpenOrdersPage initialSelected={FOCUS.id} />,
};

/** @summary Phone: the same detail as a full-height sheet with the headline and tabs. */
export const DetailPhone: Story = {
  render: () => <OpenOrdersPage initialSelected={FOCUS.id} />,
  ...phone,
};
