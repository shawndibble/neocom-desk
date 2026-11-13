import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { buildBookView, type BookView } from '@/engine/corpTaxBook/bookView';
import { BookProvider } from './BookContext';
import { RecordPaymentDialog } from './BookDialogs';
import { BOOK_CONTEXT, BOOK_VIEW, VARRO_ID } from './corpBookFixture';

/**
 * Record payment on the sample book (`corp/CorpBookDialogs` has the plain one): the
 * outcome panel across two Statements, an overpayment held as credit, and matching
 * the wallet's Unmatched donation instead of typing an amount.
 */

/** The sample book with an older Statement for Varro, so a payment reaches two. */
function withOlderStatement(view: BookView): BookView {
  const sep = view.input.statements.find((s) => s.minerId === VARRO_ID);
  if (!sep) return view;
  const aug = {
    ...sep,
    id: `${sep.id}-aug`,
    code: `${sep.code}A`,
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    coversFrom: '2026-07-01',
    coversThrough: '2026-07-31',
    issuedAt: '2026-08-01T10:00:00Z',
    lines: [],
    amount: 4_250_000,
  };
  return buildBookView({ ...view.input, statements: [aug, ...view.input.statements] });
}

const TWO = withOlderStatement(BOOK_VIEW);

function Book({ view = BOOK_VIEW, children }: { view?: BookView; children: ReactNode }) {
  return <BookProvider value={{ ...BOOK_CONTEXT, view }}>{children}</BookProvider>;
}

const meta = {
  title: 'corp/RecordPaymentDialog',
  parameters: { layout: 'fullscreen', shell: { path: '/corp/moons', scopes: [] } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { globals: { viewport: { value: 'mobile1', isRotated: false } } };
const noop = () => {};

function Dialog({ view = BOOK_VIEW, amount }: { view?: BookView; amount?: number }) {
  const miner = view.miners.find((m) => m.id === VARRO_ID)!;
  return (
    <Book view={view}>
      <RecordPaymentDialog
        open
        onClose={noop}
        miner={miner}
        minerName={BOOK_CONTEXT.names.character(miner.mainCharacterId)}
        defaultAmount={amount ?? miner.owed}
      />
    </Book>
  );
}

/** @summary Part of what is owed: clears the oldest Statement, part-pays the next, says what is left. */
export const AcrossTwoStatements: Story = {
  render: () => <Dialog view={TWO} amount={7_000_000} />,
};
/** @summary Across two Statements, phone. */
export const AcrossTwoStatementsPhone: Story = { ...AcrossTwoStatements, ...phone };

/** @summary More than is owed: every Statement cleared and the rest held as credit. */
export const Overpay: Story = {
  render: () => {
    const miner = BOOK_VIEW.miners.find((m) => m.id === VARRO_ID)!;
    return <Dialog amount={Math.round(miner.owed) + 5_000_000} />;
  },
};

const pickDonation: Story['play'] = async () => {
  await new Promise((r) => setTimeout(r, 300));
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('dialog button')];
  buttons.find((b) => b.textContent?.startsWith('Wallet donation'))?.click();
  await new Promise((r) => setTimeout(r, 100));
  document.querySelector<HTMLInputElement>('dialog input[name="record-donation"]')?.click();
};

/** @summary Matching a wallet donation: picking it assigns that ISK to the Miner, nothing new is recorded. */
export const MatchDonation: Story = {
  render: () => <Dialog />,
  play: pickDonation,
};
/** @summary Matching a wallet donation, phone. */
export const MatchDonationPhone: Story = { ...MatchDonation, ...phone };
