import { useState, type ReactElement, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  ColumnPickerMenu,
  DataTable,
  Disclosure,
  Field,
  Fields,
  FilterBar,
  FilterChip,
  FilterField,
  InfoTooltip,
  MenuItem,
  Modal,
  ProgressBar,
  RowActionsMenu,
  SearchInput,
  SegmentedControl,
  StatChip,
  StatChips,
  textActionClassName,
  type DataTableColumn,
  type ModalPlacement,
} from '@/components/ui';
import { IskAmount } from '@/components/ui/IskAmount';
import { CharacterBadge } from '@/features/character/assetBrowserRows';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { CopyablePrice } from '@/features/market/CopyablePrice';
import { OrderProblemBadge, type OrderBadgeKind } from '@/features/market/OrderProblemBadge';
import { formatIsk, formatMarketIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { NewComponent } from './NewComponent';
import { OpenOrdersChrome } from './OpenOrdersChrome';
import { ACT, FINE, FOCUS, OPEN_ORDERS_SHELL, WATCH, type MockOrder } from './openOrdersSample';

/**
 * Proposal, Form A, "Fix list" (action-first): Open Orders opens on the
 * orders that need the pilot, worst first, in one flat four-column table.
 * Each row says what is wrong (the badge alone) and what to do (the verdict,
 * with the exact price to type, click to copy). Watch and All are one tap
 * away in a segmented control; healthy orders fold to one quiet line. The
 * Order Detail modal becomes a narrow dialog (a bottom sheet on a phone) led
 * by one verdict and one Copy button, three facts beneath it, and every
 * explanation folded into four Disclosures with a one-line answer each.
 *
 * New components in this mockup: `FixListSummary` (headline count plus the
 * quiet ISK / watch / fine line), `HealthyFold` (the "9 healthy orders ·
 * Show" line and the badges link under the list), `ListNotes` (the notice
 * stack as one quiet line), `VerdictBlock` (the modal's badge, big verdict,
 * why, Copy and View in market), `StickyCopyFooter` (phone sheet's pinned
 * Copy button), `ScopeRivals` (Who is cheaper body), `ExitsList` (Other ways
 * out body). Everything else is an existing primitive.
 *
 * Where it went:
 * - 8 problem-group headers and their 4-fact hint lines: gone as headers; the
 *   list is one flat worst-first table and the SegmentedControl splits Needs
 *   you / Watch / All. The hint facts live in the detail's Disclosures.
 * - Per-group "Check deeper": the detail's Who is cheaper body (shown when a
 *   scope is not checked yet).
 * - Problem cell sentence + its copy button: sentence is the detail's
 *   VerdictBlock "why" line; the copy is the Do this cell's CopyablePrice.
 * - Price column: detail StatChip "Your price" (exact).
 * - Location column (full station name): row shows the short name under the
 *   item (desktop); full name is the detail subtitle. Off-hub tooltip moves
 *   with it to the subtitle.
 * - Floor column: detail "What it cost you" trailing ("Floor …") and body,
 *   with the floor help tooltip and its wallet/build caption.
 * - Remaining column: detail "The numbers" › Volume left (bar + "42 of 60"),
 *   and the subtitle.
 * - Expires column: "The numbers" › Expires (date, days left, issued on).
 *   Expiring orders still surface as their own badge in the list.
 * - Buy/Sell side: "Buy order" on the station line for buy rows; the subtitle.
 * - Phone card: station and Character badge drop off the two-line card; both
 *   are in the detail subtitle.
 * - Column picker: a "Columns" button beside Filters (desktop). Four fixed
 *   columns; Your price, Station cheapest, Never sell below, Remaining and
 *   Expires are optional and off by default. Phone cards ignore the choice.
 * - Filter list (side, problem, cost basis, expiring within, min ISK tied
 *   up, location, sort): inside the FilterBar funnel, not on the page.
 * - Character filter, Refresh and Export: the PageHeader actions.
 * - Notice stack (cached, assumes base standings, Character not shared): one
 *   quiet `ListNotes` line at the foot of the list.
 * - Badge "?" tooltips: in the detail (the VerdictBlock badge keeps its "?")
 *   and the "What do these badges mean?" link under the list.
 * - Modal Quick answer card: VerdictBlock. Next-step label + price: the Copy
 *   button. Row summary sentence: the VerdictBlock why line.
 * - "The numbers" stat grid: three StatChips (your price, cheapest here, you
 *   keep a unit) + The numbers Disclosure (rank, sells out in, per day,
 *   volume left, expires, issued, sell value, profit if sold as listed).
 * - "Who is cheaper" scope table: Who is cheaper Disclosure (seller, price,
 *   over by ISK and %, sellers and units under you, distance, tightest bites).
 * - "Where that price comes from" ledger: What it cost you Disclosure (cost a
 *   unit, sales tax, relist broker fee, floor, wallet basis source). The
 *   structure fee line joins it on structure orders.
 * - "Is there a better exit?": Other ways out Disclosure.
 * - View in Market: ghost Button in the VerdictBlock; ⋮ menu keeps it too.
 */

const ME = 2119876543;

type View = 'act' | 'watch' | 'all';

const tiedUp = (orders: MockOrder[]) => orders.reduce((sum, o) => sum + o.iskTiedUp, 0);

function badgeKind(order: MockOrder): OrderBadgeKind {
  if (order.state === 'healthy') return order.side === 'buy' ? 'topBid' : 'best';
  return order.state;
}

/** "Do this": the verdict as the copy target when it already states the price. */
function DoThis({ order }: { order: MockOrder }) {
  if (order.nextPrice === undefined) return <span>{order.verdict}</span>;
  const priceText = formatMarketIsk(order.nextPrice);
  if (order.verdict.includes(priceText))
    return <CopyablePrice price={order.nextPrice}>{order.verdict}</CopyablePrice>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span>{order.verdict}:</span>
      <CopyablePrice price={order.nextPrice} />
    </span>
  );
}

const fixedColumns: DataTableColumn<MockOrder>[] = [
  {
    id: 'item',
    header: 'Item',
    primary: true,
    sortValue: (o) => o.item,
    render: (o) => (
      <span className="block min-w-0">
        <span className="font-medium text-accent">{o.item}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-dim max-sm:hidden">
          <span className="whitespace-nowrap">
            {o.stationShort}
            {o.side === 'buy' && ' · Buy order'}
          </span>
          <span className="-ml-1.5">
            <CharacterBadge characterName={o.character} />
          </span>
        </span>
      </span>
    ),
  },
  {
    id: 'wrong',
    header: "What's wrong",
    cardCorner: true,
    className: 'whitespace-nowrap',
    render: (o) => (
      <OrderProblemBadge kind={badgeKind(o)} detail={o.badgeDetail} interactive={false} />
    ),
  },
  {
    id: 'do',
    header: 'Do this',
    className: 'font-semibold',
    render: (o) => <DoThis order={o} />,
  },
];

const tiedUpColumn: DataTableColumn<MockOrder> = {
  id: 'tied',
  header: 'ISK tied up',
  align: 'right',
  headerClassName: 'whitespace-nowrap',
  className: 'tabular-nums whitespace-nowrap',
  sortValue: (o) => o.iskTiedUp,
  render: (o) => (
    <span data-dense-omit>
      <IskAmount value={o.iskTiedUp} />
    </span>
  ),
};

/** The station's cheapest sell (or top bid, for a buy order), when one beats you. */
const stationRival = (o: MockOrder) => o.rivals.find((r) => r.scope === 'Station' && r.price > 0);

const dim = <span className="text-text-dim">—</span>;

/** Off by default; the Columns button next to Filters turns each on. */
const optionalColumns = {
  price: {
    id: 'price',
    header: 'Your price',
    align: 'right',
    headerClassName: 'whitespace-nowrap',
    className: 'tabular-nums whitespace-nowrap',
    sortValue: (o) => o.price,
    render: (o) => formatMarketIsk(o.price),
  },
  cheapest: {
    id: 'cheapest',
    header: 'Station cheapest',
    align: 'right',
    headerClassName: 'whitespace-nowrap',
    className: 'tabular-nums whitespace-nowrap',
    sortValue: (o) => stationRival(o)?.price,
    render: (o) => {
      const rival = stationRival(o);
      if (!rival) return dim;
      return (
        <span>
          {formatMarketIsk(rival.price)}
          {o.side === 'buy' && <span className="text-text-dim"> bid</span>}
        </span>
      );
    },
  },
  floor: {
    id: 'floor',
    header: 'Never sell below',
    align: 'right',
    headerClassName: 'whitespace-nowrap',
    className: 'tabular-nums whitespace-nowrap',
    sortValue: (o) => o.floor,
    render: (o) =>
      o.floor === undefined ? (
        dim
      ) : (
        <span className={o.price < o.floor ? 'text-isk-neg' : undefined}>
          {formatMarketIsk(o.floor)}
        </span>
      ),
  },
  remaining: {
    id: 'remaining',
    header: 'Remaining',
    align: 'right',
    className: 'tabular-nums whitespace-nowrap',
    sortValue: (o) => o.remain / o.total,
    render: (o) => `${o.remain.toLocaleString('en-US')} / ${o.total.toLocaleString('en-US')}`,
  },
  expires: {
    id: 'expires',
    header: 'Expires',
    align: 'right',
    className: 'tabular-nums whitespace-nowrap',
    sortValue: (o) => o.expiresDays,
    render: (o) => (
      <span className={o.expiresDays <= 7 ? 'text-warning' : undefined}>{o.expiresDays}d</span>
    ),
  },
} satisfies Record<string, DataTableColumn<MockOrder>>;

type OptionalColumnId = keyof typeof optionalColumns;
const OPTIONAL_IDS = Object.keys(optionalColumns) as OptionalColumnId[];

/** Fixed columns, then the optional ones that are on, then ISK tied up last. */
function tableColumns(visible: readonly OptionalColumnId[]): DataTableColumn<MockOrder>[] {
  return [
    ...fixedColumns,
    ...OPTIONAL_IDS.filter((id) => visible.includes(id)).map((id) => optionalColumns[id]),
    tiedUpColumn,
  ];
}

function rowMenu(order: MockOrder, tr: ReactElement) {
  return (
    <RowActionsMenu
      name={order.item}
      items={
        <>
          {order.nextPrice !== undefined && <MenuItem onSelect={() => {}}>Copy new price</MenuItem>}
          <MenuItem onSelect={() => {}}>View in Market</MenuItem>
          <MenuItem onSelect={() => {}}>Set a price alert…</MenuItem>
          <MenuItem onSelect={() => {}}>Add to a Stock List…</MenuItem>
          <MenuItem onSelect={() => {}}>Set waypoint to {order.stationShort}</MenuItem>
          <MenuItem onSelect={() => {}}>Show info</MenuItem>
        </>
      }
    >
      {tr}
    </RowActionsMenu>
  );
}

function FixListSummary() {
  const n = ACT.length;
  return (
    <NewComponent name="FixListSummary">
      <h2 className="text-xl font-semibold text-text">
        {n} {n === 1 ? 'order needs' : 'orders need'} you
      </h2>
      <p className="mt-0.5 text-sm text-text-dim">
        <IskAmount value={tiedUp(ACT)} /> ISK tied up in them · {WATCH.length} to watch ·{' '}
        {FINE.length} fine
      </p>
    </NewComponent>
  );
}

function OrderFilters({
  visible,
  onToggle,
  onReset,
}: {
  visible: readonly OptionalColumnId[];
  onToggle: (id: OptionalColumnId) => void;
  onReset: () => void;
}) {
  const [value, setValue] = useState({ text: '' });
  // Phone cards ignore column choices, as the phone list does today.
  const isPhone = useIsPhone();
  return (
    <FilterBar
      className="min-w-0 flex-1"
      value={value}
      onChange={setValue}
      activeCount={0}
      triggerLabel
      actions={
        !isPhone && (
          <ColumnPickerMenu
            available={OPTIONAL_IDS}
            visible={visible}
            columnsById={optionalColumns}
            onToggle={onToggle}
            buttonLabel="Columns"
            menuTitle="Show columns"
            onReset={onReset}
            resetLabel="Reset to default"
            showLabel
          />
        )
      }
      search={
        <SearchInput
          className="min-w-40 flex-1"
          value={value.text}
          onChange={(event) => setValue({ text: event.target.value })}
          placeholder="Search item or station…"
          aria-label="Search orders"
        />
      }
    >
      {() => (
        <>
          <FilterField label="Side">
            <FilterChip label="Buy" selected={false} onToggle={() => {}} />
            <FilterChip label="Sell" selected={false} onToggle={() => {}} />
          </FilterField>
          <FilterField label="Problem">
            <FilterChip label="Below floor" selected={false} onToggle={() => {}} />
            <FilterChip label="Undercut" selected={false} onToggle={() => {}} />
            <FilterChip label="Outbid" selected={false} onToggle={() => {}} />
            <FilterChip label="Expiring" selected={false} onToggle={() => {}} />
          </FilterField>
          <FilterField label="Cost basis">
            <FilterChip label="Linked" selected={false} onToggle={() => {}} />
            <FilterChip label="Missing" selected={false} onToggle={() => {}} />
          </FilterField>
          <FilterField label="Expiring within">
            <FilterChip label="3 days" selected={false} onToggle={() => {}} />
            <FilterChip label="7 days" selected={false} onToggle={() => {}} />
          </FilterField>
          <FilterField label="Min ISK tied up">
            <FilterChip label="10M+" selected={false} onToggle={() => {}} />
            <FilterChip label="100M+" selected={false} onToggle={() => {}} />
          </FilterField>
          <FilterField label="Location">
            <FilterChip label="Jita 4-4" selected={false} onToggle={() => {}} />
            <FilterChip label="Amarr 8" selected={false} onToggle={() => {}} />
          </FilterField>
          <FilterField label="Sort">
            <FilterChip label="Worst first" selected onToggle={() => {}} />
            <FilterChip label="Most ISK" selected={false} onToggle={() => {}} />
          </FilterField>
        </>
      )}
    </FilterBar>
  );
}

function HealthyFold() {
  return (
    <NewComponent name="HealthyFold">
      <div className="flex flex-wrap items-center gap-x-2 text-sm text-text-dim">
        <span>{FINE.length} healthy orders</span>
        <span aria-hidden="true">·</span>
        <button type="button" className={textActionClassName()}>
          Show
        </button>
      </div>
      <button type="button" className={textActionClassName('mt-1')}>
        What do these badges mean?
      </button>
    </NewComponent>
  );
}

function ListNotes() {
  return (
    <NewComponent name="ListNotes">
      <p className="text-xs text-text-dim">
        Fees assume base standings for Kestrel Vane · Prices checked just now
      </p>
    </NewComponent>
  );
}

function OrdersPage({
  detail,
  initialColumns = [],
}: {
  detail?: ModalPlacement;
  initialColumns?: readonly OptionalColumnId[];
}) {
  const [view, setView] = useState<View>('act');
  const [visible, setVisible] = useState<readonly OptionalColumnId[]>(initialColumns);
  const toggleColumn = (id: OptionalColumnId) =>
    setVisible((on) => (on.includes(id) ? on.filter((x) => x !== id) : [...on, id]));
  return (
    <div className="space-y-3 px-4 py-4">
      <OpenOrdersChrome
        actions={
          <CharacterFilterControl
            activeCharacterId={ME}
            value="all"
            onChange={() => {}}
            characterCount={2}
          />
        }
      />
      <FixListSummary />
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<View>
          label="Which orders"
          uppercase={false}
          className="max-sm:w-full"
          fill
          value={view}
          onChange={setView}
          options={[
            { value: 'act', label: `Needs you (${ACT.length})` },
            { value: 'watch', label: `Watch (${WATCH.length})` },
            { value: 'all', label: `All (${ACT.length + WATCH.length + FINE.length})` },
          ]}
        />
        <OrderFilters visible={visible} onToggle={toggleColumn} onReset={() => setVisible([])} />
      </div>
      <DataTable
        label="Orders that need you"
        className="dt-actions-pinned-only"
        columns={tableColumns(visible)}
        rows={ACT}
        rowKey={(o) => o.id}
        density="compact"
        stackLayout="dense"
        onRowClick={() => {}}
        rowContextMenu={rowMenu}
        rowMoreActions
        selectedRowKey={detail ? FOCUS.id : null}
      />
      <HealthyFold />
      <ListNotes />
      {detail && <OrderDetail order={FOCUS} placement={detail} />}
    </div>
  );
}

/* ---------- Order Detail ---------- */

function VerdictBlock({ order, withCopy }: { order: MockOrder; withCopy: boolean }) {
  return (
    <NewComponent name="VerdictBlock">
      <OrderProblemBadge kind={badgeKind(order)} detail={order.badgeDetail} />
      <p className="mt-2 text-2xl font-semibold text-text">{order.verdict}</p>
      <p className="mt-1 text-sm text-text-dim">{order.verdictDetail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {withCopy && order.nextPrice !== undefined && (
          <Button variant="primary">Copy {formatMarketIsk(order.nextPrice)}</Button>
        )}
        <Button>View in market</Button>
      </div>
    </NewComponent>
  );
}

function StickyCopyFooter({ order }: { order: MockOrder }) {
  if (order.nextPrice === undefined) return null;
  return (
    <div className="sticky bottom-0 -mx-3 -mb-[calc(0.75rem_+_env(safe-area-inset-bottom))] mt-3 border-t border-line bg-panel px-3 pt-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]">
      <NewComponent name="StickyCopyFooter">
        <Button variant="primary" className="w-full">
          Copy {formatMarketIsk(order.nextPrice)}
        </Button>
      </NewComponent>
    </div>
  );
}

function ScopeRivals({ order }: { order: MockOrder }) {
  return (
    <NewComponent name="ScopeRivals">
      <ul className="divide-y divide-line">
        {order.rivals.map((r) => (
          <li key={r.scope} className="py-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-text">{r.scope}</span>
              {r.price ? (
                <span className="tabular-nums text-text">{formatMarketIsk(r.price)}</span>
              ) : (
                <span className="text-success">Nobody cheaper</span>
              )}
            </div>
            {r.price > 0 && (
              <>
                <p className="mt-0.5 text-xs text-text-dim">
                  {r.seller} · {r.distance}
                </p>
                <p className="text-xs text-text-dim">
                  You are{' '}
                  <span className="text-danger tabular-nums">
                    {formatMarketIsk(r.overByIsk)} over ({r.overByPct}%)
                  </span>{' '}
                  · {r.sellersUnder} sellers, {r.unitsUnder} units under you
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
    </NewComponent>
  );
}

function ExitsList({ order }: { order: MockOrder }) {
  const relist = order.nextPrice === undefined ? null : formatMarketIsk(order.nextPrice);
  return (
    <NewComponent name="ExitsList">
      <ul className="divide-y divide-line">
        {order.exits.map((e) => (
          <li key={e.label} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="text-text">{e.label}</span>
              {relist && e.detail?.includes(relist) && (
                <span className="ml-1.5 text-xs text-text-dim">the call above</span>
              )}
              {e.detail && <span className="block text-xs text-text-dim">{e.detail}</span>}
            </span>
            <span className="shrink-0 tabular-nums">
              {formatMarketIsk(e.netPerUnit)} <span className="text-text-dim">a unit</span>
            </span>
          </li>
        ))}
      </ul>
    </NewComponent>
  );
}

function Section({
  label,
  trailing,
  children,
}: {
  label: string;
  trailing: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Disclosure label={label} trailing={trailing} expanded={open} onToggle={() => setOpen(!open)}>
      <div className="p-3">{children}</div>
    </Disclosure>
  );
}

function OrderDetail({ order, placement }: { order: MockOrder; placement: ModalPlacement }) {
  const isSheet = placement.startsWith('sheet');
  const station = order.rivals.find((r) => r.scope === 'Station' && r.price > 0);
  const cheapestHere = station?.price;
  const hold = order.exits.find((e) => e.label === 'Hold at your price');
  const firstRival = order.rivals.find((r) => r.price > 0);
  return (
    <Modal open onClose={() => {}} title={order.item} placement={placement}>
      <div className="space-y-4">
        <p className="text-sm text-text-dim">
          {order.character} · {order.station} · {order.side === 'buy' ? 'Buy' : 'Sell'} ·{' '}
          {order.remain} of {order.total} left
        </p>
        <VerdictBlock order={order} withCopy={!isSheet} />
        <StatChips>
          <StatChip label="Your price" value={formatMarketIsk(order.price)} />
          <StatChip
            label="Cheapest here"
            value={cheapestHere ? formatMarketIsk(cheapestHere) : 'You'}
          />
          {order.netPerUnit !== undefined && (
            <StatChip
              label="You keep a unit"
              tone={order.netPerUnit >= 0 ? 'success' : 'danger'}
              value={formatMarketIsk(order.netPerUnit)}
            />
          )}
        </StatChips>
        <div className="divide-y divide-line rounded-xs border border-line">
          <Section
            label="Who is cheaper"
            trailing={
              firstRival ? `${firstRival.scope} · ${formatMarketIsk(firstRival.price)}` : 'Nobody'
            }
          >
            <ScopeRivals order={order} />
          </Section>
          <Section label="The numbers" trailing={`Sells out in ${order.sellsOutIn}`}>
            <Fields>
              <Field label="Rank">{order.rankAtStation}</Field>
              <Field label="Sells out in">
                {order.sellsOutIn} · {order.perDay}
              </Field>
              <Field label="Volume left">
                <span className="flex items-center gap-2">
                  <ProgressBar
                    label="Volume left"
                    value={order.remain}
                    max={order.total}
                    className="w-24"
                  />
                  <span className="tabular-nums">
                    {order.remain} of {order.total}
                  </span>
                </span>
              </Field>
              <Field label="Expires">
                {order.expiresOn} · {order.expiresDays} days · issued {order.issuedOn}
              </Field>
              <Field label="Sell value">
                <IskAmount value={order.iskTiedUp} />
              </Field>
              {hold && (
                <Field label="Profit if sold as listed">
                  <IskAmount value={hold.netPerUnit * order.remain} />
                </Field>
              )}
            </Fields>
          </Section>
          <Section
            label="What it cost you"
            trailing={order.floor ? `Floor ${formatMarketIsk(order.floor)}` : 'No cost basis'}
          >
            <Fields>
              {order.costPerUnit !== undefined && (
                <Field label="Cost a unit">{formatMarketIsk(order.costPerUnit)}</Field>
              )}
              {order.salesTax !== undefined && (
                <Field label="Sales tax">{formatMarketIsk(order.salesTax)}</Field>
              )}
              {order.brokerFee !== undefined && (
                <Field label="Relist broker fee">{formatMarketIsk(order.brokerFee)}</Field>
              )}
              {order.floor !== undefined && (
                <Field label="Never sell below">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="tabular-nums">{formatIsk(order.floor)}</span>
                    <InfoTooltip
                      label="About Never sell below"
                      content="The lowest price that still covers what the units cost you plus fees, rounded up to a legal price."
                    />
                  </span>
                </Field>
              )}
              <Field label="Source">
                {order.floorSource === 'build' ? 'Your build cost' : 'Your wallet buys'}
              </Field>
            </Fields>
          </Section>
          {order.exits.length > 0 && (
            <Section label="Other ways out" trailing={`${order.exits.length} options`}>
              <ExitsList order={order} />
            </Section>
          )}
        </div>
        {isSheet && <StickyCopyFooter order={order} />}
      </div>
    </Modal>
  );
}

const meta = {
  title: 'mockups/Open Orders Form A',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: OPEN_ORDERS_SHELL },
  render: () => <OrdersPage />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Fix list: headline count, Needs you / Watch / All, one flat worst-first table of item, what's wrong, do this (exact price to copy) and ISK tied up. New components: FixListSummary, HealthyFold, ListNotes. */
export const Page: Story = {};

/** @summary Every optional column turned on from the Columns button: Your price, Station cheapest, Never sell below, Remaining, Expires. All are off by default. */
export const PageAllColumns: Story = {
  render: () => <OrdersPage initialColumns={OPTIONAL_IDS} />,
};

/** @summary Phone: the same headline and segments, the list as dense two-line cards (item + badge, then the verdict with the price to copy). */
export const PagePhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Order Detail as a narrow centered dialog: one verdict and one Copy button, three facts, four folded sections with a one-line answer each. New components: VerdictBlock, ScopeRivals, ExitsList. */
export const Detail: Story = {
  render: () => <OrdersPage detail="center" />,
};

/** @summary Phone: Order Detail as a bottom sheet in the same order, with Copy pinned to the sheet's bottom edge. New component: StickyCopyFooter. */
export const DetailPhone: Story = {
  render: () => <OrdersPage detail="sheet" />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
