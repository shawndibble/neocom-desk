import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { Button, Panel } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { cx } from '@/lib/cx';
import { NewComponent } from './NewComponent';

/**
 * Mining › Tax, the Payee cards and the phone ledger.
 *
 * A card exists to take an action (pay, link a payment, fix a conflict), so:
 *  - a card shows only for a Payee with something to do; one that is settled or in credit is not
 *    a card (a credit is a one-line note under the heading, with its Ledger link);
 *  - the card names no hidden controls: the name and the figure are plain text, Settle up is the
 *    one primary button, and Ledger and Link payment are text actions on the same row (no room:
 *    they fold into the ⋮ menu, shown as B);
 *  - the ledger of a Payee with no card is reached from Manage Payees (the PAYEES button), and
 *    the table's Payee filter keeps filtering the entries.
 *
 * Money reads by colour and sign, never the word "credit": green is yours, red with a minus is
 * owed (cards, ledger balance and amounts alike).
 *
 * The phone ledger drops the four-line label/value stack per row for a two-line row: what it was
 * and its signed amount, then the date and the running balance. Empty cells are not drawn.
 *
 * New components in this mockup: `PayeeActionCard`, `CreditNote`, `LedgerPhoneRow`.
 */
const meta = {
  title: 'mockups/MiningTaxPayeeCards',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { globals: { viewport: { value: 'mobile1', isRotated: false } } };

const ISK = ({ children }: { children: string }) => (
  <span className="shrink-0 text-xl font-semibold text-isk-neg tabular-nums">
    −{children}
    <span className="ml-1 text-xs font-normal text-text-dim">ISK</span>
  </span>
);

function PayeeActionCard({
  name,
  corpBook,
  amount,
  meta: metaLine,
  linkPayment,
  folded,
}: {
  name: string;
  corpBook?: boolean;
  amount: string;
  meta: string;
  linkPayment: boolean;
  /** Ledger and Link payment live in a ⋮ menu instead of on the row. */
  folded?: boolean;
}) {
  return (
    <NewComponent name="PayeeActionCard">
      <Panel padded={false}>
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-start gap-2">
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-base font-semibold">
              <span className="line-clamp-2 break-words">{name}</span>
              {corpBook && <Pill outlined>CORP TAX BOOK</Pill>}
            </span>
            <ISK>{amount}</ISK>
          </div>
          <p className="text-xs text-text-dim">{metaLine}</p>
          <div className="flex items-center gap-3">
            <Button variant="primary" className="flex-1">
              Settle up
            </Button>
            {folded ? (
              <Button aria-label="More actions for this Payee">⋮</Button>
            ) : (
              <>
                <button type="button" className={textActionClassName('shrink-0')}>
                  Ledger
                </button>
                {linkPayment && (
                  <button type="button" className={textActionClassName('shrink-0')}>
                    Link payment
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </Panel>
    </NewComponent>
  );
}

function CreditNote() {
  return (
    <NewComponent name="CreditNote">
      <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-text-dim">
        <span className="font-semibold text-text">Plenitude Highsec Police</span>
        <span className="text-isk-pos tabular-nums">832,879 ISK</span>
        <span>· paid ahead, new days come out of it · Mero Otichoda</span>
        <button type="button" className={textActionClassName('inline-flex')}>
          Ledger
        </button>
      </p>
    </NewComponent>
  );
}

function Cards({ folded }: { folded?: boolean }) {
  return (
    <div className="space-y-3 p-4">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[0.6875rem] font-semibold text-text-dim">You owe</span>
        <span className="text-base font-semibold text-isk-neg tabular-nums">9,212,437 ISK</span>
        <span className="text-xs text-text-dim">across 2 payees</span>
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PayeeActionCard
          name="Star Tail Industries"
          amount="5,342,548"
          meta="2 entries · oldest unpaid day was 2 days ago · Mero Otichoda"
          linkPayment
          folded={folded}
        />
        <PayeeActionCard
          name="Bureau of Unified Harvesting"
          corpBook
          amount="3,869,888"
          meta="1 entry · oldest unpaid day was yesterday · Mero Otichoda"
          linkPayment={false}
          folded={folded}
        />
      </div>
      <CreditNote />
    </div>
  );
}

/** @summary Desktop: one primary button, Ledger and Link payment as text actions on the row, the credit a one-line note. */
export const Proposed: Story = { render: () => <Cards /> };

/** @summary Phone: the same row fits at 390px; the corp book's card has no Link payment. */
export const ProposedPhone: Story = { ...phone, render: () => <Cards /> };

/** @summary Fallback B: Ledger and Link payment folded into a ⋮ menu beside Settle up. */
export const FoldedMenu: Story = { ...phone, render: () => <Cards folded /> };

interface Row {
  what: string;
  date: string;
  /** Signed from the pilot's side: a charge adds to what is owed, a payment takes it off. */
  amount: { charge?: string; credit?: string };
  balance: { text: string; credit?: boolean };
}

const ROWS: Row[] = [
  {
    what: 'Payment from older marks',
    date: '2026-11-14',
    amount: { credit: '2,634,084' },
    balance: { text: '832,879', credit: true },
  },
  {
    what: 'Mined at Talidal',
    date: '2026-11-14',
    amount: { charge: '2,634,084' },
    balance: { text: '−1,801,205' },
  },
  {
    what: 'Payment from older marks',
    date: '2026-11-01',
    amount: { credit: '1,393,761' },
    balance: { text: '832,879', credit: true },
  },
  {
    what: 'Mined at Moro',
    date: '2026-10-31',
    amount: { charge: '1,393,761' },
    balance: { text: '−560,882' },
  },
];

function LedgerPhoneRow({ row }: { row: Row }) {
  const sign = row.amount.credit ? '' : '−';
  const value = row.amount.credit ?? row.amount.charge ?? '';
  return (
    <li className="flex items-center gap-3 border-t border-border px-3 py-2 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold">{row.what}</span>
          {/* Charged and Credited were two labelled rows, one always blank: one signed figure. */}
          <span
            className={cx(
              'shrink-0 text-sm tabular-nums',
              row.amount.credit ? 'text-isk-pos' : 'text-isk-neg'
            )}
          >
            {sign}
            {value}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 text-xs text-text-dim">
          <span className="tabular-nums">{row.date}</span>
          <span className={cx('tabular-nums', row.balance.credit ? 'text-isk-pos' : 'text-isk-neg')}>
            Balance {row.balance.text}
          </span>
        </div>
      </div>
      <span aria-hidden className="text-text-dim">
        ›
      </span>
    </li>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="space-y-3 p-4">{children}</div>;
}

/** @summary Phone ledger: two lines per row, one signed amount, empty cells not drawn. */
export const LedgerPhone: Story = {
  ...phone,
  render: () => (
    <Frame>
      <div className="flex items-baseline gap-4 text-xs">
        <span className="text-text-dim">
          PAID THROUGH <span className="text-sm font-semibold text-isk-pos">2026-11-14</span>
        </span>
        <span className="text-text-dim">
          BALANCE <span className="text-isk-pos">832,879 ISK</span>
        </span>
      </div>
      <NewComponent name="LedgerPhoneRow">
        <Panel title="Ledger" padded={false}>
          <ul>
            {ROWS.map((r, i) => (
              <LedgerPhoneRow key={i} row={r} />
            ))}
          </ul>
        </Panel>
      </NewComponent>
    </Frame>
  ),
};
