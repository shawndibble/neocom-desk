import { useState, type MouseEvent, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  CollapsiblePanel,
  DataTable,
  Disclosure,
  IconButton,
  IskAmount,
  Modal,
  SearchInput,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { CharacterBadge } from '@/features/character/assetBrowserRows';
import { CopyablePrice } from '@/features/market/CopyablePrice';
import { OrderProblemBadge, type OrderBadgeKind } from '@/features/market/OrderProblemBadge';
import { cx } from '@/lib/cx';
import { formatIsk, formatMarketIsk } from '@/lib/isk';
import { NewComponent } from './NewComponent';
import { OpenOrdersChrome } from './OpenOrdersChrome';
import {
  ACT,
  FINE,
  FOCUS,
  WATCH,
  type MockOrder,
  type ScopeRival,
  type Urgency,
  OPEN_ORDERS_SHELL,
} from './openOrdersSample';

/**
 * Open Orders, Form C: "Triage inbox". The page sorts orders into three
 * buckets by urgency, the way a food-delivery app splits Pending from
 * Completed: Fix now, Watch, Fine. Three tiles at the top say how many sit in
 * each bucket and jump to it. Each order is a card with its status tag on
 * top, the one thing to do as the big line (the exact price, tap to copy),
 * one quiet line of why, and the station, stock and time left underneath.
 * Fine is folded. The Order Detail reads as a three-step story: what's wrong,
 * what to do, why (the why folded into four disclosures).
 *
 * New components in this mockup: `TriageTiles` (three count tiles that jump
 * to a section), `OrderCard` (full and compact), `WhatsWrongStep` (status,
 * sentence, your price vs cheapest with the gap), `WhatToDoStep` (the exact
 * new price, Copy price, View in market, keep-after-fees and floor line),
 * `WhyStep` (numbered heading over four `Disclosure`s) and `StickyActionBar`
 * (phone detail footer with the one Copy button). Everything else is an
 * existing primitive: `PageHeader`, `DataAgeBadge`, `SearchInput`,
 * `IconButton`, `CollapsiblePanel`, `Modal`, `Disclosure`, `DataTable`,
 * `Button`, `IskAmount`, `OrderProblemBadge`, `CopyablePrice`,
 * `CharacterBadge`.
 *
 * Where it went:
 * - 8 problem-group headers + 4-fact hint lines → 3 urgency sections; the
 *   per-state hint lives in each card's `OrderProblemBadge` "?" tooltip.
 * - Notice stack above the list → the tiles say what needs you; a "Not
 *   checked" order says so on its own card.
 * - Filter bar + Character filter + column picker → one Filters funnel (sheet)
 *   beside search; columns are gone (cards), so nothing to pick.
 * - Refresh, export menu, data age → page header, unchanged.
 * - Item → card name (accent text; the card click opens the detail).
 * - Character → `CharacterBadge` beside the name; also the detail's context line.
 * - Where (station) → card footer short name; full name in the detail's
 *   context line; off-hub flagged "off hub" in the footer.
 * - Price (yours) → "from …" after the big action line (Fix now), card footer
 *   (Watch/Fine); detail step ① "Your price".
 * - Problem badge + detail → card top tag; detail step ①.
 * - Problem sentence + copy price → card big line ("Undercut to 4,479,900",
 *   the phrase is the copy control); full sentence in detail step ①.
 * - Floor (+ source) → detail step ② line; ledger in "What it cost you".
 * - Remaining (remain/total) → card footer; detail "The numbers".
 * - Expires (days) → card footer; date in detail "The numbers".
 * - Issued on, side (buy/sell) → detail context line; buy orders also say
 *   "Buy" in the card footer.
 * - ISK tied up → card footer (`IskAmount`), section totals, Fix now tile.
 * - Quick answer card → step ① (sentence) + step ② (action).
 * - "The numbers" stat grid (rank, sells out, per day, volume left, expires,
 *   per unit after fees) → folded "The numbers"; per-unit keep also in step ②.
 * - "Who is cheaper" scope table → folded "Who is cheaper"; the tightest
 *   rival is step ①'s "Cheapest here"; seller count on the card quiet line.
 * - "Where that price comes from" ledger → folded "What it cost you".
 * - "Is there a better exit?" → folded "Other ways out".
 * - ItemContextMenu (Build plan, alerts, stock target…) → the card's one ⋮.
 */

/** Data age for the header badge: two minutes before the story loads. */

type Section = 'act' | 'watch' | 'fine';

const SECTION_LABEL: Record<Section, string> = {
  act: 'Fix now',
  watch: 'Watch',
  fine: 'Fine',
};

/** Urgency colour (DESIGN.md §1 status tokens). Words carry it too: the section heading. */
const URGENCY_BAR: Record<Urgency, string> = {
  act: 'border-l-danger',
  watch: 'border-l-warning',
  fine: 'border-l-success',
};
const URGENCY_DOT: Record<Urgency, string> = {
  act: 'bg-danger',
  watch: 'bg-warning',
  fine: 'bg-success',
};
const URGENCY_TILE: Record<Urgency, string> = {
  act: 'border-danger/50 bg-danger/10',
  watch: 'border-warning/50 bg-warning/10',
  fine: 'border-success/40 bg-success/5',
};
const URGENCY_TEXT: Record<Urgency, string> = {
  act: 'text-danger',
  watch: 'text-warning',
  fine: 'text-success',
};

const kindOf = (o: MockOrder): OrderBadgeKind =>
  o.state === 'healthy' ? (o.side === 'buy' ? 'topBid' : 'best') : o.state;

const tiedUp = (orders: MockOrder[]) => orders.reduce((sum, o) => sum + o.iskTiedUp, 0);
const qty = (n: number) => n.toLocaleString('en');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const stop = (event: MouseEvent) => event.stopPropagation();

/** The verb before the exact price on the card's big line. */
function actionVerb(o: MockOrder): string {
  if (o.state === 'belowFloor') return 'Raise to';
  if (o.state === 'outbid') return 'Bid';
  return 'Undercut to';
}

/** "3 sellers under you" / "1 bid over you" / "Nobody under you". */
function rivalsLine(o: MockOrder): string {
  if (o.rivals.length === 0) return 'Prices not checked';
  const tight = o.rivals.find((r) => r.sellersUnder > 0);
  if (!tight) return o.side === 'buy' ? 'Nobody bids over you' : 'Nobody under you';
  if (o.side === 'buy') return `${plural(tight.sellersUnder, 'bid', 'bids')} over you`;
  const where = tight.scope === 'Station' ? 'here' : `in the ${tight.scope.toLowerCase()}`;
  return `${plural(tight.sellersUnder, 'seller', 'sellers')} under you ${where}`;
}

/** What a unit leaves you, in words that carry the sign. */
function NetLine({ o }: { o: MockOrder }) {
  if (o.netPerUnit === undefined) {
    return null;
  }
  if (o.netPerUnit < 0) {
    return (
      <span className="text-isk-neg">each sale loses {formatIsk(-o.netPerUnit)} as listed</span>
    );
  }
  return (
    <>
      you keep <span className="text-text">{formatIsk(o.netPerUnit)}</span> a unit
    </>
  );
}

function CardFooter({ o, withPrice }: { o: MockOrder; withPrice: boolean }) {
  // Each fact keeps its own leading dot, so a wrap never strands a "·" at a line end.
  const facts: ReactNode[] = [
    o.side === 'buy' && 'Buy',
    withPrice && formatMarketIsk(o.price),
    `${o.stationShort}${o.offHub ? ' (off hub)' : ''}`,
    `${qty(o.remain)}/${qty(o.total)} left`,
    <span className={o.expiresDays <= 3 ? 'text-warning' : undefined}>{o.expiresDays}d left</span>,
    <>
      <IskAmount value={o.iskTiedUp} /> listed
    </>,
  ].filter(Boolean);
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-dim tabular-nums">
      {facts.map((fact, i) => (
        <span key={i} className="whitespace-nowrap">
          {i > 0 && <span aria-hidden="true">· </span>}
          {fact}
        </span>
      ))}
    </p>
  );
}

/** One order as an inbox card. `compact` drops the big action line (Watch, Fine). */
function OrderCard({
  o,
  urgency,
  compact = false,
  onOpen,
  surface = 'panel',
}: {
  o: MockOrder;
  urgency: Urgency;
  compact?: boolean;
  onOpen: () => void;
  surface?: 'panel' | 'panel-2';
}) {
  return (
    <NewComponent name="OrderCard">
      <article
        onClick={onOpen}
        className={cx(
          'min-w-0 cursor-pointer rounded-xs border border-l-2 border-line p-3 transition-colors hover:border-line-bright',
          URGENCY_BAR[urgency],
          surface === 'panel' ? 'bg-panel' : 'bg-panel-2'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <OrderProblemBadge kind={kindOf(o)} detail={o.badgeDetail} />
          <span onClick={stop} className="-mt-1 -mr-1">
            <IconButton
              icon={<Icon.More />}
              label={`More actions for ${o.item}`}
              variant="plain"
              size="row"
            />
          </span>
        </div>
        <div className="mt-1 flex min-w-0 items-center">
          <span className="truncate font-semibold text-accent">{o.item}</span>
          <CharacterBadge characterName={o.character} />
        </div>
        {compact ? (
          <p className="mt-1 text-sm text-text">{o.verdict}</p>
        ) : (
          <>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-lg tabular-nums">
              {o.nextPrice !== undefined ? (
                <>
                  <span onClick={stop}>
                    <CopyablePrice price={o.nextPrice}>
                      {actionVerb(o)} {formatMarketIsk(o.nextPrice)}
                    </CopyablePrice>
                  </span>
                  <span className="text-sm text-text-dim">from {formatMarketIsk(o.price)}</span>
                </>
              ) : (
                <span className="font-semibold">{o.verdict}</span>
              )}
            </div>
            <p className="text-sm text-text-dim tabular-nums">
              {rivalsLine(o)}
              {o.netPerUnit !== undefined && ' · '}
              <NetLine o={o} />
            </p>
          </>
        )}
        <CardFooter o={o} withPrice={compact} />
      </article>
    </NewComponent>
  );
}

function TriageTiles() {
  const tiles: { id: Section; orders: MockOrder[] }[] = [
    { id: 'act', orders: ACT },
    { id: 'watch', orders: WATCH },
    { id: 'fine', orders: FINE },
  ];
  return (
    <NewComponent name="TriageTiles">
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {tiles.map(({ id, orders }) => (
          <div key={id} className={cx('min-w-0 rounded-xs border p-2 md:p-3', URGENCY_TILE[id])}>
            <a
              href={`#orders-${id}`}
              onClick={(event) => event.preventDefault()}
              className="block rounded-xs focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span
                className={cx(
                  'block text-[0.6875rem] font-semibold tracking-widest uppercase',
                  URGENCY_TEXT[id]
                )}
              >
                {SECTION_LABEL[id]}
              </span>
              <span className="block text-2xl leading-tight font-semibold tabular-nums md:text-3xl">
                {orders.length}
              </span>
            </a>
            {id === 'act' && (
              <span className="block truncate text-xs text-text-dim tabular-nums">
                <IskAmount value={tiedUp(orders)} />
                <span className="max-md:hidden"> listed</span>
              </span>
            )}
          </div>
        ))}
      </div>
    </NewComponent>
  );
}

function SectionHeading({ id, orders }: { id: Section; orders: MockOrder[] }) {
  return (
    <h2
      id={`orders-${id}`}
      className="flex items-center gap-2 text-sm font-semibold tracking-wide text-text"
    >
      <span aria-hidden="true" className={cx('size-2 rounded-full', URGENCY_DOT[id])} />
      {SECTION_LABEL[id]} <span className="font-normal text-text-dim">({orders.length})</span>
      <span className="ml-auto text-xs font-normal text-text-dim tabular-nums">
        <IskAmount value={tiedUp(orders)} /> listed
      </span>
    </h2>
  );
}

function OrdersPage({ onOpen }: { onOpen: (o: MockOrder) => void }) {
  const [fineOpen, setFineOpen] = useState(false);
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4">
      <OpenOrdersChrome />
      <TriageTiles />
      <div className="flex items-center gap-2">
        <SearchInput
          className="min-w-0 flex-1"
          value=""
          onChange={() => {}}
          placeholder="Search item or station…"
          aria-label="Search orders"
        />
        <IconButton icon={<Icon.Filter />} label="Filters" />
      </div>

      <section className="space-y-2">
        <SectionHeading id="act" orders={ACT} />
        <div className="grid gap-3 lg:grid-cols-2">
          {ACT.map((o) => (
            <OrderCard key={o.id} o={o} urgency="act" onOpen={() => onOpen(o)} />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeading id="watch" orders={WATCH} />
        <div className="grid gap-3 lg:grid-cols-2">
          {WATCH.map((o) => (
            <OrderCard key={o.id} o={o} urgency="watch" compact onOpen={() => onOpen(o)} />
          ))}
        </div>
      </section>

      <CollapsiblePanel
        title={`Fine (${FINE.length})`}
        meta={
          <span id="orders-fine" className="text-xs text-text-dim tabular-nums">
            Nothing to do · <IskAmount value={tiedUp(FINE)} /> listed
          </span>
        }
        expanded={fineOpen}
        onToggle={() => setFineOpen((open) => !open)}
        labels={{ show: 'Show fine orders', hide: 'Hide fine orders' }}
        padded={false}
      >
        <div className="grid gap-3 p-3 lg:grid-cols-2">
          {FINE.map((o) => (
            <OrderCard
              key={o.id}
              o={o}
              urgency="fine"
              compact
              surface="panel-2"
              onOpen={() => onOpen(o)}
            />
          ))}
        </div>
      </CollapsiblePanel>
    </div>
  );
}

/* ---------------- Order Detail ---------------- */

function StepHeading({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
      <span className="flex size-5 items-center justify-center rounded-full border border-line-bright text-text tabular-nums">
        {n}
      </span>
      {children}
    </h3>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-2.5 py-1.5 text-sm">
      <span className="text-text-dim">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
}

const scopeColumns: DataTableColumn<ScopeRival>[] = [
  { id: 'scope', header: 'Where', render: (r) => r.scope, stickyStart: true },
  {
    id: 'seller',
    header: 'Cheapest seller',
    render: (r) => (r.price ? r.seller : <span className="text-text-dim">Nobody under you</span>),
  },
  {
    id: 'price',
    header: 'Their price',
    align: 'right',
    className: 'tabular-nums whitespace-nowrap',
    render: (r) => (r.price ? formatMarketIsk(r.price) : '—'),
  },
  {
    id: 'under',
    header: 'Under you',
    align: 'right',
    className: 'tabular-nums whitespace-nowrap',
    render: (r) =>
      r.price ? `${plural(r.sellersUnder, 'seller', 'sellers')} · ${qty(r.unitsUnder)} units` : '—',
  },
  {
    id: 'over',
    header: 'You are over by',
    align: 'right',
    className: 'tabular-nums whitespace-nowrap',
    render: (r) => (r.price ? `${formatMarketIsk(r.overByIsk)} (${r.overByPct}%)` : '—'),
  },
  {
    id: 'distance',
    header: 'Distance',
    className: 'whitespace-nowrap',
    render: (r) => r.distance || '—',
  },
];

function WhyDisclosures({ o }: { o: MockOrder }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => () => setOpen((s) => ({ ...s, [key]: !s[key] }));
  const station = o.rivals.find((r) => r.scope === 'Station');
  const hold = o.exits.find((e) => e.label === 'Hold at your price');
  const best = [...o.exits].sort((a, b) => b.netPerUnit - a.netPerUnit)[0];
  return (
    <div className="divide-y divide-line rounded-xs border border-line">
      <Disclosure
        label="Who is cheaper"
        trailing={station?.price ? rivalsLine(o) : 'Nobody under you'}
        expanded={!!open.who}
        onToggle={toggle('who')}
      >
        <div className="overflow-x-auto">
          <DataTable
            label="Who is cheaper, by scope"
            columns={scopeColumns}
            rows={o.rivals}
            rowKey={(r) => r.scope}
            density="compact"
            responsive="table"
          />
        </div>
      </Disclosure>
      <Disclosure
        label="The numbers"
        trailing={o.rankAtStation.replace(' at this station', '')}
        expanded={!!open.numbers}
        onToggle={toggle('numbers')}
      >
        <Row label="Rank">{o.rankAtStation}</Row>
        <Row label="Sells out in">
          {o.sellsOutIn}
          {o.perDay && <span className="text-text-dim"> · {o.perDay}</span>}
        </Row>
        <Row label="Volume left">
          {qty(o.remain)} of {qty(o.total)}
        </Row>
        <Row label="Expires">
          {o.expiresOn} <span className="text-text-dim">· {o.expiresDays} days</span>
        </Row>
        <Row label="ISK listed">{formatIsk(o.iskTiedUp)}</Row>
        {hold && <Row label="A unit after fees, as listed">{formatIsk(hold.netPerUnit)}</Row>}
      </Disclosure>
      <Disclosure
        label="What it cost you"
        trailing={o.costPerUnit !== undefined ? `${formatIsk(o.costPerUnit)} a unit` : '—'}
        expanded={!!open.cost}
        onToggle={toggle('cost')}
      >
        {o.costPerUnit !== undefined && (
          <Row
            label={`Cost a unit (${o.floorSource === 'build' ? 'your build' : 'your wallet buys'})`}
          >
            {formatIsk(o.costPerUnit, 2)}
          </Row>
        )}
        {o.salesTax !== undefined && <Row label="Sales tax a unit">{formatIsk(o.salesTax, 2)}</Row>}
        {o.brokerFee !== undefined && (
          <Row label="Broker fee to relist">{formatIsk(o.brokerFee, 2)}</Row>
        )}
        {o.floor !== undefined && (
          <Row label="Never sell below">
            <span className="font-semibold">{formatIsk(o.floor, 2)}</span>
          </Row>
        )}
      </Disclosure>
      <Disclosure
        label="Other ways out"
        trailing={best ? `Best: ${best.label.toLowerCase()}` : 'None'}
        expanded={!!open.exits}
        onToggle={toggle('exits')}
      >
        {o.exits.map((e) => (
          <Row
            key={e.label}
            label={
              <>
                {e.label}
                {e.detail && <span className="block text-xs">{e.detail}</span>}
              </>
            }
          >
            <span className={e.netPerUnit < 0 ? 'text-isk-neg' : undefined}>
              {formatIsk(e.netPerUnit)}
            </span>{' '}
            <span className="text-xs text-text-dim">a unit</span>
          </Row>
        ))}
      </Disclosure>
    </div>
  );
}

function OrderDetail({ o, phone }: { o: MockOrder; phone: boolean }) {
  const cheapest = o.rivals.find((r) => r.price > 0);
  return (
    <div className="space-y-5">
      <p className="text-xs text-text-dim">
        {o.character} · {o.side === 'sell' ? 'Sell' : 'Buy'} order · {o.station} · issued{' '}
        {o.issuedOn}
      </p>

      <NewComponent name="WhatsWrongStep">
        <section className="space-y-2">
          <StepHeading n={1}>What&rsquo;s wrong</StepHeading>
          <OrderProblemBadge kind={kindOf(o)} detail={cheapest ? undefined : o.badgeDetail} />
          <p className="text-sm text-text">{o.verdictDetail}</p>
          {cheapest && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xs bg-panel-2 p-3">
              <div className="min-w-0">
                <span className="block text-[0.6875rem] tracking-widest text-text-dim uppercase">
                  Your price
                </span>
                <span className="block text-lg font-semibold tabular-nums md:text-xl">
                  {formatMarketIsk(o.price)}
                </span>
              </div>
              <span className="rounded-xs bg-danger/15 px-1.5 py-0.5 text-xs font-semibold text-danger tabular-nums">
                {cheapest.overByPct}% over
              </span>
              <div className="min-w-0 text-right">
                <span className="block text-[0.6875rem] tracking-widest text-text-dim uppercase">
                  Cheapest {cheapest.scope === 'Station' ? 'here' : `in ${cheapest.scope}`}
                </span>
                <span className="block text-lg font-semibold tabular-nums md:text-xl">
                  {formatMarketIsk(cheapest.price)}
                </span>
              </div>
            </div>
          )}
        </section>
      </NewComponent>

      <NewComponent name="WhatToDoStep">
        <section className="space-y-2">
          <StepHeading n={2}>What to do</StepHeading>
          {o.nextPrice === undefined ? (
            <p className="text-xl font-semibold">{o.verdict}</p>
          ) : (
            <>
              <p className="text-sm text-text-dim">{actionVerb(o)}</p>
              <p className="text-3xl font-semibold tabular-nums">{formatMarketIsk(o.nextPrice)}</p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {!phone && o.nextPrice !== undefined && <Button variant="primary">Copy price</Button>}
            <Button>View in market</Button>
          </div>
          <p className="text-sm text-text-dim tabular-nums">
            {o.netPerUnit !== undefined && (
              <>
                You keep <span className="text-text">{formatIsk(o.netPerUnit)}</span> a unit after
                fees
              </>
            )}
            {o.floor !== undefined && (
              <>
                {' '}
                · floor <span className="text-text">{formatMarketIsk(o.floor)}</span>{' '}
                <span className="text-xs">
                  ({o.floorSource === 'build' ? 'from your build cost' : 'from your wallet buys'})
                </span>
              </>
            )}
          </p>
        </section>
      </NewComponent>

      <NewComponent name="WhyStep">
        <section className="space-y-2">
          <StepHeading n={3}>Why</StepHeading>
          <WhyDisclosures o={o} />
        </section>
      </NewComponent>

      {phone && o.nextPrice !== undefined && (
        <div className="sticky bottom-0 -mx-3 -mb-3 border-t border-line bg-panel px-3 pt-2 pb-3">
          <NewComponent name="StickyActionBar">
            <Button variant="primary" className="w-full">
              Copy {formatMarketIsk(o.nextPrice)}
            </Button>
          </NewComponent>
        </div>
      )}
    </div>
  );
}

function FormC({ detail, phone = false }: { detail: boolean; phone?: boolean }) {
  const [open, setOpen] = useState<MockOrder | null>(detail ? FOCUS : null);
  return (
    <>
      <OrdersPage onOpen={setOpen} />
      {open && (
        <Modal
          open
          onClose={() => setOpen(null)}
          title={open.item}
          placement={phone ? 'sheet-full' : 'center'}
        >
          <OrderDetail o={open} phone={phone} />
        </Modal>
      )}
    </>
  );
}

const meta = {
  title: 'mockups/Open Orders Form C',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: OPEN_ORDERS_SHELL },
  render: () => <FormC detail={false} />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Triage inbox: Fix now / Watch / Fine tiles, Fix now cards with the exact price to type, Watch compact, Fine folded. */
export const Page: Story = {};

/** @summary Phone: the tiles as a 3-up strip, cards full width, sections stacked. */
export const PagePhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Order Detail as a three-step story: what's wrong, what to do (Copy price), why (four folded disclosures). */
export const Detail: Story = {
  render: () => <FormC detail />,
};

/** @summary Phone: the detail as a full-height sheet, steps stacked, Copy price pinned in a sticky footer. */
export const DetailPhone: Story = {
  render: () => <FormC detail phone />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
