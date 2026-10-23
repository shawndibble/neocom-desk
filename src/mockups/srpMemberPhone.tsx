/**
 * Phone layouts for the SRP member mockups: dense two-line `DataTable` cards,
 * the pilot's recent losses first, the paste field behind a disclosure.
 */
import { useState } from 'react';
import {
  Button,
  DataTable,
  Disclosure,
  EmptyState,
  Modal,
  Panel,
  type DataTableColumn,
} from '@/components/ui';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { NewComponent } from './NewComponent';
import { CLAIMS, type Claim, type LostShip } from './srpMemberFixtures';
import { FileClaimForm, RefileDialog, StatePill, type FormState } from './srpMemberParts';

const amountText = (c: Claim) =>
  c.amount === null ? 'Officer sets amount' : `${formatIskCompact(c.amount)} ISK`;

const canRefile = (c: Claim) => c.state === 'Rejected' && !c.refiled;

// ---------------------------------------------------------------- Losses

function LostAction({ ship }: { ship: LostShip }) {
  if (ship.kind === 'open') {
    return (
      <Button variant="ghost" size="sm">
        File
      </Button>
    );
  }
  const word = { claimed: 'Claimed', old: 'Too old', notCovered: 'Not covered' }[ship.kind];
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">{word}</span>
  );
}

const lostColumns: DataTableColumn<LostShip>[] = [
  { id: 'hull', header: 'Ship', primary: true, render: (s) => s.hull },
  { id: 'action', header: 'File', cardCorner: true, render: (s) => <LostAction ship={s} /> },
  {
    id: 'meta',
    header: 'Details',
    render: (s) =>
      [s.system, `${s.ageDays}d ago`, s.value ? formatIskCompact(s.value) : null]
        .filter(Boolean)
        .join(' · '),
  },
];

export function PhoneLosses({ ships }: { ships: LostShip[] }) {
  return (
    <Panel title="Your recent losses" padded={false}>
      <NewComponent name="LostShipsList">
        <DataTable
          label="My lost ships"
          columns={lostColumns}
          rows={ships}
          rowKey={(s) => s.id}
          stackLayout="dense"
          rowClassName={(s) =>
            s.kind === 'old' || s.kind === 'notCovered' ? 'opacity-70' : undefined
          }
        />
      </NewComponent>
    </Panel>
  );
}

export function PhoneGrantCard() {
  return (
    <Panel title="Show my lost ships">
      <div className="space-y-3">
        <p className="text-sm text-text-dim">
          Allow killmail access and your recent losses list here, one tap to file each.
        </p>
        <Button variant="ghost" className="min-h-11 w-full">
          Grant killmail access
        </Button>
      </div>
    </Panel>
  );
}

/** The one-line grant prompt kept above a form that is already in use. */
export function PhoneGrantLine() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xs border border-line px-3 py-2">
      <span className="text-sm">
        <span className="font-semibold text-warning">Show my lost ships</span>
      </span>
      <Button variant="ghost" size="sm">
        Grant access
      </Button>
    </div>
  );
}

export function PhonePaste({ form, open }: { form?: FormState; open: boolean }) {
  const [expanded, setExpanded] = useState(open);
  return (
    <Panel padded={false}>
      <Disclosure
        label="Paste a killmail link instead"
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      >
        <div className="p-3">
          <FileClaimForm state={form} fullWidth />
        </div>
      </Disclosure>
    </Panel>
  );
}

// ---------------------------------------------------------------- Claims

const OPEN_FIRST = { Pending: 0, Approved: 0, Paid: 1, Rejected: 1 } as const;
const ordered = (claims: Claim[]) =>
  [...claims].sort((a, b) => OPEN_FIRST[a.state] - OPEN_FIRST[b.state]);

function claimColumns(): DataTableColumn<Claim>[] {
  return [
    { id: 'hull', header: 'Ship', primary: true, render: (c) => c.hull },
    {
      id: 'state',
      header: 'Status',
      cardCorner: true,
      render: (c) => <StatePill state={c.state} />,
    },
    {
      id: 'meta',
      header: 'Details',
      render: (c) => `${c.lostAt.split(',')[0]} · ${c.system} · ${amountText(c)}`,
    },
    {
      id: 'reason',
      header: 'Reason',
      stackEdge: 'below',
      render: (c) =>
        c.reason ? (
          <div className="space-y-2 whitespace-normal">
            <p className="line-clamp-2 text-xs text-text-dim">
              <span className="font-semibold text-danger">Reason:</span> {c.reason}
            </p>
            {canRefile(c) ? (
              <Button
                variant="ghost"
                className="min-h-11 w-full whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
              >
                Re-file…
              </Button>
            ) : (
              <p className="text-xs text-text-dim">Re-filed once, final.</p>
            )}
          </div>
        ) : null,
    },
  ];
}

export function PhoneClaims({
  claims = CLAIMS,
  onOpen,
}: {
  claims?: Claim[];
  onOpen?: (c: Claim) => void;
}) {
  return (
    <Panel title="My claims" padded={claims.length === 0}>
      {claims.length > 0 ? (
        <DataTable
          label="My SRP claims"
          columns={claimColumns()}
          rows={ordered(claims)}
          rowKey={(c) => c.id}
          stackLayout="dense"
          onRowClick={onOpen}
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

// ------------------------------------------------------------ Detail sheet

export function ClaimDetailSheet({ claim }: { claim: Claim }) {
  const timeline = [
    `${claim.filed}: you filed this claim`,
    claim.state === 'Pending' ? 'Waiting for an officer' : null,
    claim.state === 'Approved' ? 'Approved, waiting for payment' : null,
    claim.state === 'Paid' ? 'Paid to you in game' : null,
    claim.state === 'Rejected' ? 'Rejected by an officer' : null,
  ].filter((t): t is string => Boolean(t));
  return (
    <Modal
      open
      onClose={() => undefined}
      placement="sheet"
      title={claim.hull}
      footer={
        canRefile(claim) ? (
          <Button variant="primary" className="min-h-11 w-full">
            Re-file…
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <StatePill state={claim.state} />
          <span className="text-text-dim">
            {claim.amount === null ? 'Officer will set the amount' : formatIsk(claim.amount)}
          </span>
        </div>
        <p className="text-text-dim">
          Lost {claim.lostAt} in {claim.system}
        </p>
        {claim.reason ? (
          <p>
            <span className="font-semibold text-danger">Reason:</span> {claim.reason}
          </p>
        ) : null}
        <ol className="space-y-1 border-l border-line pl-3">
          {timeline.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
        <ExternalLink href="https://zkillboard.com/kill/128840221/">View killmail</ExternalLink>
      </div>
    </Modal>
  );
}

export { RefileDialog };
