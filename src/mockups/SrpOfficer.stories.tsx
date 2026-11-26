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

export const Queue1440: Story = { render: () => <Queue /> };
export const Queue390: Story = { render: () => <Queue />, globals: { viewport: PHONE.viewport } };

export const ApproveToast1440: Story = { render: () => <Queue toast /> };
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

export const Reject1440: Story = { render: () => <WithDialog dialog="reject" /> };
export const Reject390: Story = {
  render: () => <WithDialog dialog="reject" />,
  globals: { viewport: PHONE.viewport },
};

export const Override1440: Story = { render: () => <WithDialog dialog="override" /> };
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

export const Approved1440: Story = { render: () => <ApprovedTab /> };
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

export const Detail1440: Story = { render: () => <Detail /> };
export const Detail390: Story = { render: () => <Detail />, globals: { viewport: PHONE.viewport } };

export const DetailOverridden1440: Story = { render: () => <Detail overridden /> };
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

export const History1440: Story = { render: () => <History /> };
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

export const Empty1440: Story = { render: () => <Empty /> };
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

export const NoAmount1440: Story = { render: () => <NoAmount /> };
export const NoAmount390: Story = {
  render: () => <NoAmount />,
  globals: { viewport: PHONE.viewport },
};
