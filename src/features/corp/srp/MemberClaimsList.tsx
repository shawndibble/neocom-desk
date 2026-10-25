import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, DataTable, type DataTableColumn } from '@/components/ui';
import { IskAmount } from '@/components/ui/IskAmount';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';
import type { SrpClaimState } from '../srpTypes';
import { canRefile, orderClaims, type MemberClaim } from './srpMemberModel';

const STATE_TONE: Record<SrpClaimState, PillTone> = {
  pending: 'warning',
  approved: 'neutral',
  paid: 'success',
  rejected: 'danger',
};

const STATE_KEY: Record<SrpClaimState, string> = {
  pending: 'srpMember.claims.states.pending',
  approved: 'srpMember.claims.states.approved',
  paid: 'srpMember.claims.states.paid',
  rejected: 'srpMember.claims.states.rejected',
};

export function ClaimStatePill({ state }: { state: SrpClaimState }) {
  const { t } = useTranslation();
  return <Pill tone={STATE_TONE[state]}>{t(STATE_KEY[state])}</Pill>;
}

/** The ISK, or "Officer sets amount" while nobody has typed one. */
export function ClaimAmount({ claim }: { claim: MemberClaim }) {
  const { t } = useTranslation();
  return claim.amount === null ? (
    <span className="text-text-dim">{t('srpMember.claims.officerSets')}</span>
  ) : (
    <IskAmount value={claim.amount} decimals={0} className="tabular-nums" />
  );
}

interface MemberClaimsListProps {
  claims: readonly MemberClaim[];
  hullName: (typeId: number) => string;
  systemName: (systemId: number) => string;
  /** A row tap or click opens the claim's detail. */
  onOpen: (claim: MemberClaim) => void;
  onRefile: (claim: MemberClaim) => void;
}

/**
 * The pilot's claims, open ones first. One `DataTable`: columns on desktop, dense two-line cards
 * on a phone. A Rejected claim carries its reason and, once, a Re-file (full width on a phone).
 */
export function MemberClaimsList({
  claims,
  hullName,
  systemName,
  onOpen,
  onRefile,
}: MemberClaimsListProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const rows = useMemo(() => orderClaims(claims), [claims]);
  const columns = useMemo<DataTableColumn<MemberClaim>[]>(
    () => [
      {
        id: 'hull',
        header: t('srpMember.claims.ship'),
        primary: true,
        render: (c) => <span className="font-medium">{hullName(c.hullTypeId)}</span>,
      },
      {
        id: 'state',
        header: t('srpMember.claims.status'),
        cardCorner: true,
        render: (c) => <ClaimStatePill state={c.state} />,
      },
      {
        id: 'lost',
        header: t('srpMember.claims.lost'),
        render: (c) => (
          <span className="tabular-nums">{formatDateOnly(new Date(c.killedAt), timeZone)}</span>
        ),
      },
      {
        id: 'system',
        header: t('srpMember.claims.system'),
        render: (c) => systemName(c.solarSystemId),
      },
      {
        id: 'filed',
        header: t('srpMember.claims.filed'),
        // The phone card's line carries the loss date; the filed date is in the detail sheet.
        render: (c) => (
          <span data-dense-omit className="whitespace-nowrap tabular-nums">
            {formatDateOnly(new Date(c.filedAt), timeZone)}
          </span>
        ),
      },
      {
        id: 'amount',
        header: t('srpMember.claims.amount'),
        align: 'right',
        render: (c) => <ClaimAmount claim={c} />,
      },
      {
        id: 'reason',
        header: t('srpMember.claims.reason'),
        stackEdge: 'below',
        render: (c) =>
          c.state === 'rejected' ? (
            <div className="space-y-2 whitespace-normal">
              {c.rejectionReason ? (
                <p className="line-clamp-2 text-xs text-text-dim">
                  <span className="font-semibold text-danger">
                    {t('srpMember.claims.reasonLabel')}
                  </span>{' '}
                  {c.rejectionReason}
                </p>
              ) : null}
              {canRefile(c) ? (
                <Button
                  variant="ghost"
                  className="min-h-9 w-full whitespace-nowrap sm:min-h-0 sm:w-auto"
                  aria-label={t('srpMember.claims.refileShip', { hull: hullName(c.hullTypeId) })}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefile(c);
                  }}
                >
                  {t('srpMember.claims.refile')}
                </Button>
              ) : (
                <p className="text-xs text-text-dim">{t('srpMember.claims.refiledFinal')}</p>
              )}
            </div>
          ) : null,
      },
    ],
    [t, timeZone, hullName, systemName, onRefile]
  );
  return (
    <div className="overflow-x-auto">
      <DataTable
        label={t('srpMember.claims.label')}
        columns={columns}
        rows={rows}
        rowKey={(c) => c.killmailId}
        stackLayout="dense"
        onRowClick={onOpen}
      />
    </div>
  );
}
