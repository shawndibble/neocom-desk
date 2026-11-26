import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { SlideOver } from '@/components/ui';
import { minerDetail } from '@/engine/corpTaxBook/bookView';
import type { AuditEntry } from '@/features/corp/taxBook/bookClient';
import { AuditFeed } from './AuditFeed';
import { BookProvider } from './BookContext';
import { AssignDonationDialog, MarkNotTaxDialog, RecordPaymentDialog } from './BookDialogs';
import { CloseAccountDialog } from './CloseAccountDialog';
import { AdjustmentDialog, RateOverrideDialog } from './CorrectionDialogs';
import { DeleteBookDialog } from './DeleteBookSection';
import { LinkSurveyDialog } from './LinkSurveyDialog';
import { TurnOnBook } from './TurnOnBook';
import { useAuditSubject } from './useAuditSubject';
import { BOOK_CONTEXT, BOOK_VIEW, MOON_ID, VARRO_ID } from './corpBookFixture';

const MINER = BOOK_VIEW.miners.find((m) => m.id === VARRO_ID)!;
const DETAIL = minerDetail(BOOK_VIEW, VARRO_ID)!;
const NAME = BOOK_CONTEXT.names.character(MINER.mainCharacterId);
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
    action: 'issueLateNotice',
    detail: { minerId: 'solo:3', listed: 12_500_000 },
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

function ActivityFeed() {
  return <AuditFeed entries={AUDIT} subject={useAuditSubject()} />;
}

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

export const Activity: Story = {
  render: () => (
    <SlideOver open onClose={noop} title="Activity" wide>
      <ActivityFeed />
    </SlideOver>
  ),
};
export const ActivityPhone: Story = { ...Activity, ...phone };

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
export const RecordPaymentPhone: Story = { ...RecordPayment, ...phone };

export const MarkNotTax: Story = {
  render: () => <MarkNotTaxDialog open onClose={noop} payment={PAYMENT} fromName={NAME} />,
};

export const AssignDonation: Story = {
  render: () => <AssignDonationDialog open onClose={noop} payment={DONATION} fromName="Pilot 99" />,
};

export const RateOverride: Story = {
  render: () => <RateOverrideDialog open onClose={noop} days={DETAIL.days} />,
};

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
export const CloseAccountPhone: Story = { ...CloseAccount, ...phone };

export const LinkSurvey: Story = {
  render: () => <LinkSurveyDialog open onClose={noop} extractionId={MOON_ID} />,
};

export const DeleteBook: Story = { render: () => <DeleteBookDialog onClose={noop} /> };

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
export const TurnOnPhone: Story = { ...TurnOn, ...phone };
