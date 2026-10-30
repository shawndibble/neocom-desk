/** Pieces of the SRP member mockups: the file-a-claim card and My claims. */
import { useId, type ReactNode } from 'react';
import {
  Button,
  DataTable,
  EmptyState,
  Field,
  FieldError,
  Fields,
  Modal,
  PageHeader,
  Panel,
  ReauthBanner,
  TextArea,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { Pill } from '@/components/ui/Pill';
import { formatIsk } from '@/lib/isk';
import { useIsPhone } from '@/lib/useIsPhone';
import { NewComponent } from './NewComponent';
import { CLAIMS, type Claim, type ClaimState, type LostShip } from './srpMemberFixtures';

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-page space-y-4 px-4 py-4">{children}</div>;
}

export function SrpHeader() {
  return (
    <PageHeader
      title="SRP"
      meta={<span className="text-xs text-text-dim">Rules set by Northern Cross Logistics</span>}
    />
  );
}

const STATE_TONE: Record<ClaimState, 'warning' | 'neutral' | 'success' | 'danger'> = {
  Pending: 'warning',
  Approved: 'neutral',
  Paid: 'success',
  Rejected: 'danger',
};

export function StatePill({ state }: { state: ClaimState }) {
  return <Pill tone={STATE_TONE[state]}>{state}</Pill>;
}

export function Amount({ value }: { value: number | null }) {
  return value === null ? (
    <span className="text-text-dim">Officer will set the amount</span>
  ) : (
    <span className="tabular-nums">{formatIsk(value)}</span>
  );
}

// ------------------------------------------------------------ File a claim

export interface FormState {
  link?: string;
  linkError?: string;
  fleet?: string;
  fleetError?: string;
  /** Hull the pasted link resolved to when the rule says Not covered. */
  blockedHull?: string;
  /** The corp made Fleet or FC required. */
  fleetRequired?: boolean;
}

/** Paste a killmail link, Fleet or FC, File claim. The server fills hull, system, time and amount. */
export function FileClaimForm({
  state = {},
  fullWidth = false,
}: {
  state?: FormState;
  fullWidth?: boolean;
}) {
  const linkId = useId();
  const fleetId = useId();
  const linkErr = `${linkId}-err`;
  const fleetErr = `${fleetId}-err`;
  const blocked = Boolean(state.blockedHull);
  return (
    <div className="space-y-3">
      <Fields variant="form">
        <Field
          label="Killmail link"
          htmlFor={linkId}
          note={
            state.linkError ? (
              <FieldError id={linkErr}>{state.linkError}</FieldError>
            ) : (
              'A zKillboard or ESI killmail link for one of your own losses, within 30 days.'
            )
          }
        >
          <TextInput
            id={linkId}
            defaultValue={state.link}
            placeholder="https://zkillboard.com/kill/…"
            className="w-full max-w-xl"
            aria-invalid={state.linkError ? true : undefined}
            aria-describedby={state.linkError ? linkErr : undefined}
          />
        </Field>
        <Field
          label={state.fleetRequired ? 'Fleet or FC' : 'Fleet or FC (optional)'}
          htmlFor={fleetId}
          note={
            state.fleetError ? (
              <FieldError id={fleetErr}>{state.fleetError}</FieldError>
            ) : state.fleetRequired ? (
              'Your corp asks for this on every claim.'
            ) : (
              'Who ran the fleet, if there was one.'
            )
          }
        >
          <TextInput
            id={fleetId}
            defaultValue={state.fleet}
            placeholder="e.g. Kestrel Vane"
            className="w-full max-w-xl"
            aria-invalid={state.fleetError ? true : undefined}
            aria-describedby={state.fleetError ? fleetErr : undefined}
          />
        </Field>
      </Fields>
      {blocked ? <NotCoveredNote hull={state.blockedHull!} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          aria-disabled={blocked || undefined}
          className={fullWidth ? 'min-h-11 w-full' : undefined}
        >
          File claim
        </Button>
        {fullWidth ? null : (
          <span className="text-xs text-text-dim">
            Hull, system, time and amount are filled in from the killmail.
          </span>
        )}
      </div>
    </div>
  );
}

/** Filing is blocked: the pasted hull is excluded by the corp's Hull Rule. */
export function NotCoveredNote({ hull }: { hull: string }) {
  return (
    <NewComponent name="NotCoveredNote">
      <div role="alert" className="flex items-start gap-2 text-sm">
        <Icon.Warn className="mt-0.5 shrink-0 text-danger" aria-hidden />
        <p>
          <strong className="font-semibold text-danger">{hull} is not covered.</strong> Your corp's
          SRP does not repay this hull, so there is nothing to file. Ask an officer if you think the
          rule is wrong.
        </p>
      </div>
    </NewComponent>
  );
}

// -------------------------------------------------------- Lost ships list

export function ScopePrompt() {
  return (
    <ReauthBanner
      title="Show my lost ships"
      hint="Neocom Desk needs permission to read your killmails. Pasting a link works without it."
      actionLabel="Grant killmail access"
      onLogin={() => undefined}
      variant="ghost"
    />
  );
}

function LostAction({ ship }: { ship: LostShip }) {
  switch (ship.kind) {
    case 'open':
      return (
        <Button variant="ghost" size="sm">
          File
        </Button>
      );
    case 'claimed':
      return <Pill tone="neutral">Claimed</Pill>;
    case 'old':
      return <Pill tone="neutral">Too old</Pill>;
    case 'notCovered':
      return <Pill tone="danger">Not covered</Pill>;
  }
}

const lostColumns: DataTableColumn<LostShip>[] = [
  {
    id: 'hull',
    header: 'Ship',
    render: (s) => <span className="font-medium">{s.hull}</span>,
  },
  { id: 'system', header: 'System', render: (s) => s.system },
  {
    id: 'lost',
    header: 'Lost',
    render: (s) => (
      <span className="tabular-nums">
        {s.lostAt} <span className="text-text-dim">({s.ageDays}d ago)</span>
      </span>
    ),
  },
  {
    id: 'value',
    header: 'Killmail value',
    className: 'text-right',
    render: (s) => <span className="tabular-nums">{s.value ? formatIsk(s.value) : '0 ISK'}</span>,
  },
  {
    id: 'action',
    header: '',
    className: 'text-right',
    render: (s) => <LostAction ship={s} />,
  },
];

export function LostShipsTable({ ships }: { ships: LostShip[] }) {
  return (
    <NewComponent name="LostShipsList">
      <DataTable
        label="My lost ships"
        columns={lostColumns}
        rows={ships}
        rowKey={(s) => s.id}
        rowClassName={(s) => (s.kind === 'old' ? 'opacity-70' : undefined)}
      />
    </NewComponent>
  );
}

export function FileClaimPanel({
  form,
  ships,
}: {
  form?: FormState;
  /** Absent: scope not granted, the grant prompt shows in place of the list. */
  ships?: LostShip[];
}) {
  return (
    <Panel title="File a claim">
      <div className="space-y-4">
        <FileClaimForm state={form} />
        <div className="space-y-2 border-t border-line pt-4">
          <h3 className="text-sm font-semibold">Or pick a lost ship</h3>
          {ships ? <LostShipsTable ships={ships} /> : <ScopePrompt />}
        </div>
      </div>
    </Panel>
  );
}

// -------------------------------------------------------------- My claims

const claimColumns: DataTableColumn<Claim>[] = [
  {
    id: 'hull',
    header: 'Ship',
    render: (c) => (
      <div className="space-y-1">
        <span className="font-medium">{c.hull}</span>
        {c.reason ? (
          <p className="max-w-md text-xs text-text-dim">
            <span className="font-semibold text-danger">Reason:</span> {c.reason}
          </p>
        ) : null}
      </div>
    ),
  },
  {
    id: 'lost',
    header: 'Lost',
    render: (c) => (
      <span className="tabular-nums">
        {c.lostAt} <span className="text-text-dim">in {c.system}</span>
      </span>
    ),
  },
  {
    id: 'filed',
    header: 'Filed',
    render: (c) => <span className="whitespace-nowrap tabular-nums">{c.filed}</span>,
  },
  {
    id: 'amount',
    header: 'Reimbursement',
    className: 'text-right',
    render: (c) => <Amount value={c.amount} />,
  },
  {
    id: 'state',
    header: 'Status',
    render: (c) => (
      <span className="inline-flex items-center gap-2">
        <StatePill state={c.state} />
        {c.refiled ? <span className="text-xs text-text-dim">Re-filed, final</span> : null}
      </span>
    ),
  },
  {
    id: 'action',
    header: '',
    className: 'text-right',
    render: (c) =>
      c.state === 'Rejected' && !c.refiled ? (
        <Button variant="ghost" size="sm" className="whitespace-nowrap">
          Re-file
        </Button>
      ) : null,
  },
];

export function MyClaimsPanel({ claims = CLAIMS }: { claims?: Claim[] }) {
  return (
    <Panel title="My claims" padded={claims.length > 0 ? false : true}>
      {claims.length > 0 ? (
        <DataTable
          label="My SRP claims"
          columns={claimColumns}
          rows={claims}
          rowKey={(c) => c.id}
        />
      ) : (
        <EmptyState
          title="No claims yet"
          hint="Lost a ship in the last 30 days? File it above and the corp will repay you."
        />
      )}
    </Panel>
  );
}

// ------------------------------------------------------------- Re-file dialog

export function RefileDialog() {
  const id = useId();
  const phone = useIsPhone();
  return (
    <Modal
      open
      onClose={() => undefined}
      placement={phone ? 'sheet' : 'center'}
      title="Re-file Ferox claim"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button variant="primary" className="w-full sm:w-auto">
            Re-file claim
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-text-dim">
          Rejected: Not a fleet loss: no FC listed and the kill was a solo roam. You can re-file
          once. Add a note for the officer.
        </p>
        <label htmlFor={id} className="block space-y-1">
          <span className="text-xs text-text-dim">Note</span>
          <TextArea id={id} rows={3} defaultValue="FC was Kestrel Vane, Tuesday doctrine fleet." />
        </label>
      </div>
    </Modal>
  );
}
