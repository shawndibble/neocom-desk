import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, EmptyState, Panel, Toast } from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import {
  ActivityFeed,
  BulkBar,
  ClaimDetail,
  ClaimTable,
  DETAIL_OVERRIDDEN,
  DETAIL_PENDING,
  OverrideDialog,
  PHONE,
  RejectDialog,
  SRP_PARAMS,
  SrpPage,
  approvedColumns,
  historyColumns,
  pendingColumns,
} from './srpOfficerParts';
import {
  PhoneResultToast,
  PhoneSelectionBar,
  PhoneTable,
  SelectAllAction,
  phoneApprovedColumns,
  phoneHistoryColumns,
  phonePendingColumns,
} from './srpOfficerPhone';
import { APPROVED, HISTORY, PENDING, sum } from './srpOfficerFixtures';

const noop = () => {};

/**
 * SRP, officer side, `/corp/srp` (Director or Accountant only). One story
 * throughout: 23 Oct 2026 14:00 EVE, Kestrel Vane (Director) at the queue.
 *
 * - The page header's summary line reads "N pending · X ISK owed" (owed =
 *   Approved, not yet Paid). Tabs: Pending, Approved (owed), History.
 * - A row click opens the claim detail, so the pilot name is the row handle,
 *   not a link, and the row carries no extra control for it. Per-row Approve and
 *   Reject… stay; ticking rows (only those Approve can still apply to) shows
 *   the count-labelled bulk button. Override lives in the detail and the
 *   dialog, never a row ⋮ (one real action, so no menu). No row-level move buttons.
 * - Reject… and Change amount… end in an ellipsis because each opens a dialog
 *   (reason required). Approve and Mark paid act at once; the toast says
 *   whether the result mail went ("Mail sent" / "Mail failed, status still saved").
 * - A claim with no worked-out amount shows an amount field in the row, has no
 *   checkbox, and Approve stays aria-disabled until a figure is typed.
 * - Approved rows pair a Copy button with the full ISK figure: the officer
 *   pastes it into the in-game wallet, pays, then Mark paid (or Mark paid (n)).
 * - The detail carries the killmail link (zKillboard, leaves the site so it
 *   gets the external glyph), Open in EVE as a plain text button beside the pilot,
 *   the audit trail and the state's actions.
 *
 * New components in this mockup: `SrpBulkBar` (Select all / none, selected
 * count, count-labelled buttons), `SrpClaimDetail` (facts list in a
 * `SlideOver`), `SrpAuditTrail`, `SrpActivityFeed`. `CopyAmount` (a `Button`
 * with the copy glyph) and the claim rows are composed of existing primitives
 * (`DataTable`, `Tabs`, `Modal`, `SlideOver`, `IskInput`, `TextArea`, `Pill`, `Toast`).
 */
const meta = {
  title: 'mockups/SrpOfficer',
  tags: ['!manifest'],
  parameters: SRP_PARAMS,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const pendingSelected = [PENDING[0]!.id, PENDING[1]!.id, PENDING[2]!.id];
const approvedSelected = [APPROVED[0]!.id, APPROVED[1]!.id];

function Queue({ toast }: { toast?: boolean }) {
  const phone = useIsPhone();
  const rows = toast ? PENDING.slice(3) : PENDING;
  const selected = toast ? [] : pendingSelected;
  return (
    <SrpPage
      tab="pending"
      pending={toast ? 2 : undefined}
      approved={toast ? 6 : undefined}
      owed={toast ? sum(APPROVED) + sum(PENDING.slice(0, 3)) : undefined}
    >
      {phone ? (
        <>
          <Panel
            padded={false}
            title="Pending claims"
            actions={<SelectAllAction count={rows.filter((r) => r.amount !== null).length} />}
          >
            <PhoneTable
              label="Pending SRP Claims"
              columns={phonePendingColumns(selected)}
              rows={rows}
              tick
            />
          </Panel>
          <PhoneSelectionBar
            count={selected.length}
            total={sum(PENDING.filter((c) => selected.includes(c.id)))}
            action="Approve"
            variant="primary"
            toast={
              toast ? (
                <PhoneResultToast
                  title="Approved 3 claims"
                  detail="Mail sent to 2 pilots. Mail failed for Tamsin Vell, status still saved."
                />
              ) : undefined
            }
          />
        </>
      ) : (
        <Panel padded={false} title="Pending claims">
          <div className="space-y-2 p-3">
            <BulkBar selected={toast ? 0 : 3} selectable={toast ? 1 : 4}>
              <Button variant="primary">Approve selected (3)</Button>
            </BulkBar>
          </div>
          <ClaimTable label="Pending SRP Claims" columns={pendingColumns(selected)} rows={rows} />
        </Panel>
      )}
      {toast && !phone && (
        <Toast
          message="Approved 3 claims. Mail sent to 2 pilots. Mail failed for Tamsin Vell, status still saved."
          onClose={noop}
          undo={{ label: 'Undo', onUndo: noop }}
        />
      )}
    </SrpPage>
  );
}

/** @summary Pending tab with three rows ticked: "Approve selected (3)", per-row Approve and Reject…, summary line. */
export const Queue1440: Story = { render: () => <Queue /> };
/** @summary Phone: the Pending queue as labelled cards, bulk bar above, Approve and Reject… on each card. */
export const Queue390: Story = { render: () => <Queue />, globals: { viewport: PHONE.viewport } };

/** @summary Toast after a bulk approve: quiet "Mail sent" / "Mail failed, status still saved" line. */
export const ApproveToast1440: Story = { render: () => <Queue toast /> };
/** @summary Phone: the same toast over the queue. */
export const ApproveToast390: Story = {
  render: () => <Queue toast />,
  globals: { viewport: PHONE.viewport },
};

function WithDialog({ dialog }: { dialog: 'reject' | 'override' }) {
  return (
    <>
      <Queue />
      {dialog === 'reject' ? (
        <RejectDialog claim={PENDING[1]!} />
      ) : (
        <OverrideDialog claim={PENDING[2]!} />
      )}
    </>
  );
}

/** @summary Reject dialog: required reason, mailed to the pilot, Cancel / Reject claim. */
export const Reject1440: Story = { render: () => <WithDialog dialog="reject" /> };
/** @summary Phone: Reject as a bottom sheet. */
export const Reject390: Story = {
  render: () => <WithDialog dialog="reject" />,
  globals: { viewport: PHONE.viewport },
};

/** @summary Override-amount dialog: computed amount and basis, new amount, required reason, before and after. */
export const Override1440: Story = { render: () => <WithDialog dialog="override" /> };
/** @summary Phone: Override-amount as a bottom sheet. */
export const Override390: Story = {
  render: () => <WithDialog dialog="override" />,
  globals: { viewport: PHONE.viewport },
};

function ApprovedTab() {
  const phone = useIsPhone();
  const hint = (
    <p className="text-xs text-text-dim">
      Copy the amount, pay the pilot in game, then Mark paid. Mark paid only records it; it sends no
      ISK.
    </p>
  );
  if (phone)
    return (
      <SrpPage tab="approved">
        {hint}
        <Panel padded={false} title="Owed" actions={<SelectAllAction count={APPROVED.length} />}>
          <PhoneTable
            label="Approved SRP Claims"
            columns={phoneApprovedColumns(approvedSelected, APPROVED[0]!.id)}
            rows={APPROVED}
            tick
          />
        </Panel>
        <PhoneSelectionBar
          count={approvedSelected.length}
          total={sum(APPROVED.filter((c) => approvedSelected.includes(c.id)))}
          action="Mark paid"
          variant="primary"
        />
      </SrpPage>
    );
  return (
    <SrpPage tab="approved">
      <Panel padded={false} title="Approved, waiting for payment">
        <div className="space-y-2 p-3">
          {hint}
          <BulkBar selected={2} selectable={3}>
            <Button variant="success">Mark paid (2)</Button>
          </BulkBar>
        </div>
        <ClaimTable
          label="Approved SRP Claims"
          columns={approvedColumns(approvedSelected, APPROVED[0]!.id)}
          rows={APPROVED}
        />
      </Panel>
    </SrpPage>
  );
}

/** @summary Approved (owed) tab: Copy beside each amount, Mark paid per row, "Mark paid (2)" for the ticked rows. */
export const Approved1440: Story = { render: () => <ApprovedTab /> };
/** @summary Phone: Approved cards with Copy beside the amount and Mark paid on each. */
export const Approved390: Story = {
  render: () => <ApprovedTab />,
  globals: { viewport: PHONE.viewport },
};

function Detail({ overridden }: { overridden?: boolean }) {
  return (
    <>
      {overridden ? <ApprovedTab /> : <Queue />}
      <ClaimDetail {...(overridden ? DETAIL_OVERRIDDEN : DETAIL_PENDING)} />
    </>
  );
}

/** @summary Claim detail (slide-out) of a Pending claim: facts, killmail link, Open in EVE, audit trail, Approve / Reject…. */
export const Detail1440: Story = { render: () => <Detail /> };
/** @summary Phone: the claim detail covering the page. */
export const Detail390: Story = { render: () => <Detail />, globals: { viewport: PHONE.viewport } };

/** @summary Detail of an overridden Approved claim: computed amount struck through, reason, Copy and Mark paid. */
export const DetailOverridden1440: Story = { render: () => <Detail overridden /> };
/** @summary Phone: overridden claim detail. */
export const DetailOverridden390: Story = {
  render: () => <Detail overridden />,
  globals: { viewport: PHONE.viewport },
};

function History() {
  const phone = useIsPhone();
  return (
    <SrpPage tab="history">
      <Panel padded={false} title="History">
        {phone ? (
          <PhoneTable label="SRP Claim history" columns={phoneHistoryColumns} rows={HISTORY} />
        ) : (
          <ClaimTable label="SRP Claim history" columns={historyColumns} rows={HISTORY} />
        )}
      </Panel>
      <ActivityFeed />
    </SrpPage>
  );
}

/** @summary History tab (Paid and Rejected with reasons) and the activity feed of every officer action. */
export const History1440: Story = { render: () => <History /> };
/** @summary Phone: History cards, activity feed stacked below. */
export const History390: Story = {
  render: () => <History />,
  globals: { viewport: PHONE.viewport },
};

function Empty() {
  return (
    <SrpPage tab="pending" pending={0} approved={0} owed={0}>
      <Panel title="Pending claims">
        <EmptyState
          title="Nothing to review"
          hint="New SRP Claims land here once the server has checked the killmail. Approved ones waiting for payment are on the Approved tab."
        />
      </Panel>
    </SrpPage>
  );
}

/** @summary Empty queue: "0 pending · 0 ISK owed" and an EmptyState, no bare table. */
export const Empty1440: Story = { render: () => <Empty /> };
/** @summary Phone: empty queue. */
export const Empty390: Story = { render: () => <Empty />, globals: { viewport: PHONE.viewport } };

function NoAmount() {
  const phone = useIsPhone();
  const rows = [PENDING[4]!, PENDING[3]!];
  return (
    <SrpPage tab="pending" pending={2} owed={sum(APPROVED)}>
      <Panel padded={false} title="Pending claims">
        <p className="p-3 text-xs text-text-dim">
          {rows[0]!.pilot}&apos;s claim has no worked-out amount ({rows[0]!.basis}). Type it before
          you can approve; it has no checkbox until then.
        </p>
        {phone ? (
          <PhoneTable
            label="Pending SRP Claims"
            columns={phonePendingColumns([])}
            rows={rows}
            tick
          />
        ) : (
          <ClaimTable label="Pending SRP Claims" columns={pendingColumns([])} rows={rows} />
        )}
      </Panel>
    </SrpPage>
  );
}

/** @summary "No amount: officer types it" row: amount field in the row, Approve aria-disabled, no checkbox. */
export const NoAmount1440: Story = { render: () => <NoAmount /> };
/** @summary Phone: the no-amount card with its field. */
export const NoAmount390: Story = {
  render: () => <NoAmount />,
  globals: { viewport: PHONE.viewport },
};
