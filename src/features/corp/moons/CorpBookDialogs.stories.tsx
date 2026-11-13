import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { SlideOver } from '@/components/ui';
import { minerDetail } from '@/engine/corpTaxBook/bookView';
import type { Statement } from '@/engine/corpTaxBook/statements';
import type { AuditEntry } from '@/features/corp/taxBook/bookClient';
import { AuditFeed } from './AuditFeed';
import { BookProvider } from './BookContext';
import { AssignDonationDialog, MarkNotTaxDialog, RecordPaymentDialog } from './BookDialogs';
import { CloseAccountDialog } from './CloseAccountDialog';
import { AdjustmentDialog, RateOverrideDialog, RebillDialog } from './CorrectionDialogs';
import { DeleteBookDialog } from './DeleteBookSection';
import { LinkSurveyDialog } from './LinkSurveyDialog';
import { TurnOnBook } from './TurnOnBook';
import { BOOK_CONTEXT, BOOK_VIEW, MOON_ID, VARRO_ID } from './corpBookFixture';

/**
 * Every `/corp/moons` dialog and side panel that reads only the book, open on the same
 * sample book as `corp/CorpBookSections`, plus the Director's turn-on screen. The
 * components are the route's own; nothing here is a mockup. Settings has its own
 * stories (`corp/BookSettingsDialog`).
 */
const MINER = BOOK_VIEW.miners.find((m) => m.id === VARRO_ID)!;
const DETAIL = minerDetail(BOOK_VIEW, VARRO_ID)!;
const NAME = BOOK_CONTEXT.names.character(MINER.mainCharacterId);
/** Close account is a guest's only (the Miner page offers it for nobody else). */
const GUEST = BOOK_VIEW.miners.find((m) => m.standing === 'guest')!;
const PAYMENT = DETAIL.payments[0] ?? { id: 'p3', amount: 3_000_000, at: '2026-09-16T08:00:00Z' };
const DONATION = { id: 'u1', amount: 15_000_000, at: '2026-10-16T08:12:00Z' };

const at = (iso: string) => Date.parse(iso);
const AUDIT: AuditEntry[] = [
  {
    id: 'a1',
    at: at('2026-10-18T12:00:00Z'),
    by: 1,
    byName: 'Varro Kestane',
    action: 'sync',
    detail: {},
  },
  {
    id: 'a2',
    at: at('2026-10-16T09:02:00Z'),
    by: 1,
    byName: 'Varro Kestane',
    action: 'recordPayment',
    detail: { minerId: 'solo:4', amount: 4_000_000 },
  },
  {
    id: 'a3',
    at: at('2026-09-01T10:00:00Z'),
    by: 1,
    byName: 'Varro Kestane',
    action: 'issueStatement',
    detail: { minerId: 'solo:3', amount: 12_500_000 },
  },
  {
    id: 'a4',
    at: at('2026-08-20T18:40:00Z'),
    by: 1,
    byName: 'Varro Kestane',
    action: 'addRate',
    detail: { pct: 10 },
  },
];

function Book({ children }: { children: ReactNode }) {
  return <BookProvider value={BOOK_CONTEXT}>{children}</BookProvider>;
}

const meta = {
  title: 'corp/CorpBookDialogs',
  parameters: { layout: 'fullscreen', shell: { path: '/corp/moons', scopes: [] } },
  decorators: [(S) => <Book>{S()}</Book>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { globals: { viewport: { value: 'mobile1', isRotated: false } } };
const noop = () => {};

/** @summary Activity (the header's button): the book's audit log in a side panel. */
export const Activity: Story = {
  render: () => (
    <SlideOver open onClose={noop} title="Activity" wide>
      <AuditFeed entries={AUDIT} />
    </SlideOver>
  ),
};
/** @summary Activity, phone. */
export const ActivityPhone: Story = { ...Activity, ...phone };

/** @summary Record a payment against a Miner. */
export const RecordPayment: Story = {
  render: () => (
    <RecordPaymentDialog
      open
      onClose={noop}
      miner={MINER}
      minerName={NAME}
      defaultAmount={MINER.owed}
    />
  ),
};
/** @summary Record a payment, phone. */
export const RecordPaymentPhone: Story = { ...RecordPayment, ...phone };

/** @summary Mark all or part of a payment as not tax. */
export const MarkNotTax: Story = {
  render: () => <MarkNotTaxDialog open onClose={noop} payment={PAYMENT} fromName={NAME} />,
};

/** @summary Assign an unmatched donation to a Miner. */
export const AssignDonation: Story = {
  render: () => <AssignDonationDialog open onClose={noop} payment={DONATION} fromName="Pilot 99" />,
};

/** @summary Per-day rate override (Corrections ⋮). */
export const RateOverride: Story = {
  render: () => <RateOverrideDialog open onClose={noop} days={DETAIL.days} />,
};

/** @summary Charge or credit line on the next Statement (Corrections ⋮). */
export const Adjustment: Story = {
  render: () => (
    <AdjustmentDialog
      open
      onClose={noop}
      miner={MINER}
      minerName={NAME}
      defaultDate={BOOK_VIEW.billableThrough ?? '2026-08-01'}
    />
  ),
};

/** @summary Rebill from a date (Corrections ⋮). */
export const Rebill: Story = {
  render: () => (
    <RebillDialog
      open
      onClose={noop}
      miner={MINER}
      minerName={NAME}
      statements={DETAIL.statements as Statement[]}
    />
  ),
};

/** @summary Close a Miner's account: final Statement and what is written off. */
export const CloseAccount: Story = {
  render: () => (
    <CloseAccountDialog
      open
      onClose={noop}
      miner={GUEST}
      minerName={BOOK_CONTEXT.names.character(GUEST.mainCharacterId)}
    />
  ),
};
/** @summary Close account, phone. */
export const CloseAccountPhone: Story = { ...CloseAccount, ...phone };

/** @summary Link a moon survey to an extraction (moon page). */
export const LinkSurvey: Story = {
  render: () => <LinkSurveyDialog open onClose={noop} extractionId={MOON_ID} />,
};

/** @summary Delete the book (from Settings). */
export const DeleteBook: Story = { render: () => <DeleteBookDialog onClose={noop} /> };

/** @summary Setup: a Director turns the book on (the "Run my own book" choice). */
export const TurnOn: Story = {
  render: () => (
    <div className="mx-auto max-w-page p-4">
      <TurnOnBook
        characterId={BOOK_CONTEXT.characterId}
        corporationId={BOOK_CONTEXT.corporationId}
        verdict={{ ...BOOK_CONTEXT.verdict, isDirector: true, bookActive: false }}
        onDone={noop}
        onBack={noop}
      />
    </div>
  ),
};
/** @summary Setup turn-on, phone. */
export const TurnOnPhone: Story = { ...TurnOn, ...phone };
