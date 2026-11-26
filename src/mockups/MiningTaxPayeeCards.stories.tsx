import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { Button, Panel } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { cx } from '@/lib/cx';
import { NewComponent } from './NewComponent';

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

interface CardPayee {
  name: string;
  corpBook?: boolean;
  amount: string;
  meta: string;
  linkPayment: boolean;
}

const STAR_TAIL: CardPayee = {
  name: 'Star Tail Industries',
  amount: '5,342,548',
  meta: '2 entries · oldest unpaid day was 2 days ago · Mero Otichoda',
  linkPayment: true,
};
const BUREAU: CardPayee = {
  name: 'Bureau of Unified Harvesting',
  corpBook: true,
  amount: '3,869,888',
  meta: '1 entry · oldest unpaid day was yesterday · Mero Otichoda',
  linkPayment: false,
};
const OTELA: CardPayee = {
  name: 'Otela Mining Concern',
  amount: '1,204,310',
  meta: '3 entries · oldest unpaid day was 5 days ago · Mero Otichoda',
  linkPayment: true,
};

function SecondaryActions({ linkPayment }: { linkPayment: boolean }) {
  return (
    <>
      <div className="hidden shrink-0 items-center divide-x divide-line sm:flex">
        <button type="button" className={textActionClassName('px-3 first:pl-0 last:pr-0')}>
          Ledger
        </button>
        {linkPayment && (
          <button type="button" className={textActionClassName('px-3 first:pl-0 last:pr-0')}>
            Link payment
          </button>
        )}
      </div>
      <Button className="shrink-0 sm:hidden" aria-label="More actions for this Payee">
        ⋮
      </Button>
    </>
  );
}

function PayeeActionCard({ payee, wide }: { payee: CardPayee; wide?: boolean }) {
  const name = (
    <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-base font-semibold">
      <span className="line-clamp-2 break-words">{payee.name}</span>
      {payee.corpBook && <Pill outlined>CORP TAX BOOK</Pill>}
    </span>
  );
  const actions = (
    <div className="flex items-center gap-3">
      <Button variant="primary" className={wide ? 'flex-1 sm:flex-none sm:px-8' : 'flex-1'}>
        Settle up
      </Button>
      <SecondaryActions linkPayment={payee.linkPayment} />
    </div>
  );
  return (
    <NewComponent name="PayeeActionCard">
      <Panel padded={false}>
        {wide ? (
          <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start gap-2">
                {name}
                <span className="sm:hidden">
                  <ISK>{payee.amount}</ISK>
                </span>
              </div>
              <p className="text-xs text-text-dim">{payee.meta}</p>
            </div>
            <span className="max-sm:hidden">
              <ISK>{payee.amount}</ISK>
            </span>
            {actions}
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            <div className="flex items-start gap-2">
              {name}
              <ISK>{payee.amount}</ISK>
            </div>
            <p className="text-xs text-text-dim">{payee.meta}</p>
            {actions}
          </div>
        )}
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

function Cards({
  payees,
  total,
  credit,
}: {
  payees: CardPayee[];
  total?: string;
  credit?: boolean;
}) {
  return (
    <div className="space-y-3 p-4">
      {total && (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[0.6875rem] font-semibold text-text-dim">You owe</span>
          <span className="text-base font-semibold text-isk-neg tabular-nums">{total} ISK</span>
          <span className="text-xs text-text-dim">across {payees.length} payees</span>
        </p>
      )}
      <div
        className={cx(
          'grid grid-cols-1 gap-2',
          payees.length > 1 && 'sm:grid-cols-2 xl:grid-cols-3'
        )}
      >
        {payees.map((p) => (
          <PayeeActionCard key={p.name} payee={p} wide={payees.length === 1} />
        ))}
      </div>
      {credit && <CreditNote />}
    </div>
  );
}

export const Proposed: Story = {
  render: () => <Cards payees={[STAR_TAIL, BUREAU]} total="9,212,437" credit />,
};

export const ThreePayees: Story = {
  render: () => <Cards payees={[STAR_TAIL, BUREAU, OTELA]} total="10,416,746" />,
};

export const SinglePayee: Story = { render: () => <Cards payees={[STAR_TAIL]} /> };

export const ProposedPhone: Story = {
  ...phone,
  render: () => <Cards payees={[STAR_TAIL, BUREAU]} total="9,212,437" credit />,
};

interface Row {
  what: string;
  date: string;
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
    <li className="flex items-center gap-3 border-t border-line px-3 py-2 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold">{row.what}</span>
          <span className={cx('shrink-0 text-sm tabular-nums', 'text-text')}>
            {sign}
            {value}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 text-xs text-text-dim">
          <span className="tabular-nums">{row.date}</span>
          <span
            className={cx('tabular-nums', row.balance.credit ? 'text-isk-pos' : 'text-isk-neg')}
          >
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
