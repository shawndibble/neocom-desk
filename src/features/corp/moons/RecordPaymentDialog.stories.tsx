import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { buildBookView, type BookView } from '@/engine/corpTaxBook/bookView';
import { BookProvider } from './BookContext';
import { RecordPaymentDialog } from './BookDialogs';
import { BOOK_CONTEXT, BOOK_VIEW, VARRO_ID } from './corpBookFixture';

/**
 * Record payment on the sample book (`corp/CorpBookDialogs` has the plain one): the
 * outcome panel across two days, an overpayment held as credit, and matching
 * the wallet's Unmatched donation instead of typing an amount.
 */

/** The sample book with an older unpaid day for Varro, so a payment reaches two. */
function withOlderDay(view: BookView): BookView {
  const varro = view.input.entries.find((e) => e.characterId === 1);
  if (!varro) return view;
  const older = { ...varro, date: '2026-08-02' };
  return buildBookView({ ...view.input, entries: [older, ...view.input.entries] });
}

const TWO = withOlderDay(BOOK_VIEW);

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

/** @summary Part of what is owed: pays the oldest day, part-pays the next, says what is left. */
export const AcrossTwoDays: Story = {
  render: () => <Dialog view={TWO} amount={7_000_000} />,
};
/** @summary Across two days, phone. */
export const AcrossTwoDaysPhone: Story = { ...AcrossTwoDays, ...phone };

/** @summary More than is owed: every day paid and the rest held as credit. */
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
