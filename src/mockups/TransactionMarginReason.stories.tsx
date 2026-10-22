import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router-dom';
import { DataTable, PageHeader, Panel, Tabs, type DataTableColumn } from '@/components/ui';
import { ItemInfoLink } from '@/features/entities';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { HintText } from '@/components/ui/HintText';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import { transactionMargins } from '@/features/market/transactionMargins';
import { TransactionsSummaryStrip } from '@/features/market/TransactionsSummaryStrip';
import { formatMarketIsk } from '@/lib/isk';
import { Market } from '@/routes/Market';
import { walletFixtureRoutes } from '@/storybook/esiFixtureRoutes';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { sampleDate } from '@/storybook/sampleData';
import { NewComponent } from './NewComponent';

/**
 * Issue #4736: a sale with no realized margin says why, and the totals strip
 * counts the uncosted revenue. Sample data; the ticket text wins over the picture.
 *
 * `Today` is the real Market › History page. `Proposed` is a copy of its table
 * (the real page cannot show a reason until the engine reports one), so the
 * columns are fewer than the shipped table's.
 *
 * New components in this mockup: `MarginReason` (the muted reason label that
 * replaces the dash) and `UncostedLine` (the totals-strip line; it sits inside
 * the strip once built, drawn under it here).
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const STATION = 60003760;

const NAMES: Record<number, string> = {
  3841: 'Large Shield Extender II',
  587: 'Rifter',
  2456: 'Hobgoblin II',
  28668: 'Nanite Repair Paste',
  22544: 'Hulk',
};

let nextId = 7_000_000_000;
let nextRef = 41_000_000_000;
const fill = (
  ago: number,
  typeId: number,
  quantity: number,
  unitPrice: number,
  isBuy: boolean
): WalletTransaction => ({
  transaction_id: nextId++,
  journal_ref_id: nextRef++,
  date: sampleDate(ago),
  location_id: STATION,
  type_id: typeId,
  quantity,
  unit_price: unitPrice,
  client_id: 90000001,
  is_buy: isBuy,
  is_personal: true,
});

/** Newest first, like ESI. */
function fills(): WalletTransaction[] {
  nextId = 7_000_000_000;
  nextRef = 41_000_000_000;
  return [
    fill(3 * HOUR, 3841, 4, 1_540_000, false), //   covered by the buy below, tax found → margin
    fill(9 * HOUR, 587, 3, 392_000, false), //      built: no wallet buy at all → no buy covers it
    fill(1 * DAY, 28668, 4, 126_000, false), //     outruns its buys → no buy covers it
    fill(1 * DAY + 5 * HOUR, 2456, 10, 71_000, false), // covered, but its tax line is missing
    fill(2 * DAY, 22544, 1, 62_000_000, false), //  built: no wallet buy at all
    fill(3 * DAY, 28668, 1, 119_000, false), //     covered, but its type outran its buys later
    fill(4 * DAY, 28668, 2, 88_000, true),
    fill(5 * DAY, 2456, 20, 52_000, true),
    fill(6 * DAY, 3841, 10, 1_190_000, true),
  ];
}

/** One `transaction_tax` line per sale, except the Hobgoblin sale (no line found). */
function journal(transactions: readonly WalletTransaction[]): WalletJournalEntry[] {
  return transactions
    .filter((t) => !t.is_buy && t.type_id !== 2456)
    .map((t, i) => ({
      id: 52_000_000_000 + i,
      date: t.date,
      ref_type: 'transaction_tax',
      description: 'Sales tax',
      amount: -Math.round(t.quantity * t.unit_price * 0.036),
      context_id: t.transaction_id,
      context_id_type: 'market_transaction_id',
    }));
}

const SAMPLE_FILLS = fills();
const SAMPLE_JOURNAL = journal(SAMPLE_FILLS);

function fixtureRoutes(): FixtureRoute[] {
  const at = (tail: string) => new RegExp(String.raw`^/characters/\d+${tail}$`);
  return [
    {
      path: at('/wallet/transactions'),
      respond: () => ({ body: SAMPLE_FILLS }),
    },
    {
      path: at('/wallet/journal'),
      respond: () => ({ body: SAMPLE_JOURNAL, headers: { 'X-Pages': '1' } }),
    },
    {
      method: 'POST',
      path: '/universe/names',
      respond: ({ body }) => ({
        body: (body as number[]).map((id) => ({
          id,
          name: NAMES[id] ?? `Unknown ${id}`,
          category: 'inventory_type',
        })),
      }),
    },
    ...walletFixtureRoutes(),
  ];
}

const shell = {
  path: '/market/history',
  routes: fixtureRoutes,
  scopes: ['esi-wallet.read_character_wallet.v1'],
};

type Reason = 'noBuy' | 'noTax' | 'outside';
const REASON_LABEL: Record<Reason, string> = {
  noBuy: 'No wallet buy covers it',
  noTax: 'No sales tax line found',
  outside: 'Stock came from outside this history',
};
const REASON_HINT: Record<Reason, string> = {
  noBuy: 'No earlier wallet buy covers all of these units, so there is no cost to take off.',
  noTax: "This sale's tax isn't in your journal, so a margin would overstate it.",
  outside:
    'Another sale of this item outran your wallet buys, so we cannot tell which stock this one used.',
};

/** Why a sale has no margin, by the same rules as the realized-margin engine. */
function reasons(): Map<number, Reason> {
  const margins = transactionMargins(SAMPLE_FILLS, SAMPLE_JOURNAL);
  const taxed = new Set(SAMPLE_JOURNAL.map((j) => j.context_id));
  const buys = new Map<number, number>();
  for (const t of [...SAMPLE_FILLS].reverse())
    if (t.is_buy) buys.set(t.type_id, (buys.get(t.type_id) ?? 0) + t.quantity);
  const sold = new Map<number, number>();
  const out = new Map<number, Reason>();
  for (const t of [...SAMPLE_FILLS].reverse()) {
    if (t.is_buy) continue;
    const total = (sold.get(t.type_id) ?? 0) + t.quantity;
    sold.set(t.type_id, total);
    if (margins.has(t.transaction_id)) continue;
    const covered = total <= (buys.get(t.type_id) ?? 0);
    if (!covered) out.set(t.transaction_id, 'noBuy');
    else if (!taxed.has(t.transaction_id)) out.set(t.transaction_id, 'noTax');
    else out.set(t.transaction_id, 'outside');
  }
  return out;
}

function ProposedTable() {
  const timeZone = useTimeZone();
  const margins = transactionMargins(SAMPLE_FILLS, SAMPLE_JOURNAL);
  const why = reasons();
  const uncosted = SAMPLE_FILLS.filter((t) => why.has(t.transaction_id));
  const uncostedIsk = uncosted.reduce((sum, t) => sum + t.quantity * t.unit_price, 0);
  const columns: DataTableColumn<WalletTransaction>[] = [
    {
      id: 'date',
      header: 'Date',
      className: 'whitespace-nowrap text-text-dim',
      render: (t) => formatTimestamp(new Date(t.date), timeZone),
    },
    {
      id: 'item',
      header: 'Item',
      stickyStart: true,
      render: (t) => <ItemInfoLink typeId={t.type_id}>{NAMES[t.type_id]}</ItemInfoLink>,
    },
    {
      id: 'side',
      header: 'Side',
      phoneHidden: true,
      render: (t) => (t.is_buy ? 'Buy' : 'Sell'),
    },
    {
      id: 'qty',
      header: 'Quantity',
      align: 'right',
      className: 'tabular-nums',
      render: (t) => t.quantity,
    },
    {
      id: 'unit',
      header: 'Unit price',
      align: 'right',
      className: 'tabular-nums',
      render: (t) => formatMarketIsk(t.unit_price),
    },
    {
      id: 'total',
      header: 'Total',
      align: 'right',
      className: 'tabular-nums',
      cellClassName: (t) => (t.is_buy ? 'text-isk-neg' : 'text-isk-pos'),
      render: (t) => formatMarketIsk((t.is_buy ? -1 : 1) * t.quantity * t.unit_price),
    },
    {
      id: 'margin',
      header: 'Margin',
      phoneHidden: true,
      align: 'right',
      className: 'tabular-nums',
      render: (t) => {
        if (t.is_buy) return null;
        const m = margins.get(t.transaction_id);
        if (m) return formatMarketIsk(m.margin);
        const reason = why.get(t.transaction_id);
        if (!reason) return '—';
        return (
          <HintText content={REASON_HINT[reason]}>
            <span className="text-xs text-text-dim">{REASON_LABEL[reason]}</span>
          </HintText>
        );
      },
    },
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <PageHeader title="Market" />
      <Tabs
        tabsId="mockup-market-tabs"
        label="Market"
        value="history"
        onChange={() => undefined}
        tabs={[
          { id: 'browser', label: 'Market' },
          { id: 'orders', label: 'Open' },
          { id: 'stock', label: 'Stock' },
          { id: 'history', label: 'History' },
          { id: 'appraisal', label: 'Appraisal' },
          { id: 'hauling', label: 'Hauling' },
        ]}
      />
      <TransactionsSummaryStrip transactions={SAMPLE_FILLS} />
      <NewComponent name="UncostedLine">
        <p className="text-sm text-text">
          {uncosted.length} sales uncosted · {formatMarketIsk(uncostedIsk)} ISK
        </p>
      </NewComponent>
      <NewComponent name="MarginReason (the Margin column's muted labels)">
        <Panel padded={false}>
          <DataTable
            label="Transactions"
            columns={columns}
            rows={SAMPLE_FILLS}
            rowKey={(t) => t.transaction_id}
            density="compact"
            responsive="table"
          />
        </Panel>
      </NewComponent>
    </div>
  );
}

const meta = {
  title: 'mockups/Transaction Margin Reason',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell },
  render: () => (
    <Routes>
      <Route path="market/*" element={<Market />} />
    </Routes>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { viewport: { value: 'mobile1', isRotated: false } };

/** @summary Today: Market › History with five sales; the unexplained dashes are the problem. */
export const Today: Story = {};

/** @summary Today in the phone shell (the Margin column is hidden there). */
export const TodayPhone: Story = { globals: phone };

/** @summary Proposed: a reason in each dashed Margin cell and an "N sales uncosted" line. New: MarginReason, UncostedLine. */
export const Proposed: Story = { render: () => <ProposedTable /> };

/** @summary The proposal in the phone shell: Margin stays desktop-only, the uncosted line shows. */
export const ProposedPhone: Story = { render: () => <ProposedTable />, globals: phone };
