/**
 * One claim's detail in a `SlideOver`: the facts, the amount with how it was
 * reached, the audit trail, and the state's actions (pinned at the bottom on a phone). A row click
 * opens it, so the row itself carries nothing extra for it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Eyebrow, SlideOver, Spinner, textActionClassName } from '@/components/ui';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { cx } from '@/lib/cx';
import { formatIsk } from '@/lib/isk';
import { formatTimestamp } from '@/lib/timestamp';
import { useIsPhone } from '@/lib/useIsPhone';
import { OpenInEveButton } from '@/features/openInEve/OpenInEveButton';
import type { SrpAuditEntry, SrpClaim } from '../srpClaimTypes';
import type { ClaimColumnsContext } from './claimColumnsContext';
import { ClaimStatePill, CopyAmount, TypeAmountField } from './OfficerClaimCells';
import { SrpAuditTrail } from './SrpAuditTrail';
import { claimBasisLine } from './srpClaimText';
import { approveAmount } from './srpQueue';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm">
      <dt className="text-text-dim">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function useClaimAudit(claim: SrpClaim, load: (killmailId: number) => Promise<SrpAuditEntry[]>) {
  const [loaded, setLoaded] = useState<{
    key: string;
    entries: SrpAuditEntry[] | 'failed';
  } | null>(null);
  const key = `${claim.killmailId}:${claim.state}`;
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let cancelled = false;
    loadRef
      .current(claim.killmailId)
      .then((entries) => !cancelled && setLoaded({ key, entries }))
      .catch(() => !cancelled && setLoaded({ key, entries: 'failed' }));
    return () => {
      cancelled = true;
    };
  }, [claim.killmailId, key]);
  return loaded?.key === key ? loaded.entries : null;
}

export function SrpClaimDetail({
  claim,
  ctx,
  loadAudit,
  onClose,
  onChangeAmount,
}: {
  claim: SrpClaim;
  ctx: ClaimColumnsContext;
  loadAudit: (killmailId: number) => Promise<SrpAuditEntry[]>;
  onClose: () => void;
  onChangeAmount: (claim: SrpClaim) => void;
}) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const audit = useClaimAudit(claim, loadAudit);
  const at = (ms: number) => formatTimestamp(new Date(ms), ctx.zone);
  const hull = ctx.names.hull(claim.hullTypeId);
  const blocked = ctx.busy || approveAmount(claim, ctx.typed[claim.killmailId]) === null;
  return (
    <SlideOver
      open
      onClose={onClose}
      title={t('srp.officer.detail.title', { pilot: claim.characterName, hull })}
      subtitle={t('srp.officer.detail.subtitle', { system: ctx.names.system(claim.solarSystemId) })}
      flush={phone}
    >
      <div className={cx(phone ? 'flex min-h-full flex-col' : 'space-y-4')}>
        <div className={cx('space-y-4', phone && 'flex-1 p-3')}>
          <dl className="space-y-2">
            <Row label={t('srp.officer.detail.state')}>
              <ClaimStatePill claim={claim} ctx={ctx} />
            </Row>
            <Row label={t('srp.officer.detail.pilot')}>
              <span className="flex flex-wrap items-center gap-x-3">
                {claim.characterName}
                <OpenInEveButton
                  kind="information"
                  id={claim.characterId}
                  name={claim.characterName}
                />
              </span>
            </Row>
            <Row label={t('srp.officer.detail.killmail')}>
              <ExternalLink href={`https://zkillboard.com/kill/${claim.killmailId}/`}>
                {t('srp.officer.detail.killmailLink', { id: claim.killmailId })}
              </ExternalLink>
            </Row>
            <Row label={t('srp.officer.detail.lost')}>{at(claim.killedAt)}</Row>
            <Row label={t('srp.officer.detail.filed')}>{at(claim.filedAt)}</Row>
            <Row label={t('srp.officer.detail.fleetOrFc')}>
              {claim.fleetOrFc ?? <span className="text-text-faint">-</span>}
            </Row>
            {claim.note && <Row label={t('srp.officer.detail.note')}>{claim.note}</Row>}
            {claim.previousRejectionReason && (
              <Row label={t('srp.officer.detail.note')}>
                <span className="text-text-dim">
                  {t('srp.officer.detail.previous', { reason: claim.previousRejectionReason })}
                </span>
              </Row>
            )}
            {claim.rejectionReason && (
              <Row label={t('srp.officer.detail.rejection')}>{claim.rejectionReason}</Row>
            )}
            <Row label={t('srp.officer.detail.amount')}>
              {claim.state === 'pending' && claim.amount === null ? (
                <span className="block space-y-1">
                  <TypeAmountField claim={claim} ctx={ctx} />
                  <span className="block text-xs text-warning">{claimBasisLine(t, claim)}</span>
                </span>
              ) : (
                <span className="block tabular-nums">
                  <span className="text-base font-semibold">
                    {t('srp.officer.iskAmount', { isk: formatIsk(claim.amount ?? 0) })}
                  </span>
                  <span className="block text-xs text-text-dim">{claimBasisLine(t, claim)}</span>
                  {claim.overrideReason && claim.computedAmount !== undefined && (
                    <span className="mt-1 block text-xs text-text-dim">
                      {t('srp.officer.detail.computed', {
                        isk: formatIsk(claim.computedAmount ?? 0),
                        name: claim.overrideByName ?? '',
                        reason: claim.overrideReason,
                      })}
                    </span>
                  )}
                </span>
              )}
              {(claim.state === 'pending' || claim.state === 'approved') &&
                claim.amount !== null && (
                  <button
                    type="button"
                    className={cx(textActionClassName(), 'mt-1')}
                    onClick={() => onChangeAmount(claim)}
                  >
                    {t('srp.officer.actions.changeAmount')}
                  </button>
                )}
            </Row>
          </dl>
          <div className="space-y-2">
            <Eyebrow>{t('srp.officer.detail.auditTitle')}</Eyebrow>
            {audit === null ? (
              <Spinner label={t('srp.officer.detail.auditLoading')} />
            ) : audit === 'failed' ? (
              <p className="text-sm text-text-dim">{t('srp.officer.detail.auditFailed')}</p>
            ) : (
              <SrpAuditTrail entries={audit} />
            )}
          </div>
        </div>
        {(claim.state === 'pending' || claim.state === 'approved') && (
          <div
            className={cx(
              phone
                ? 'sticky bottom-0 grid grid-cols-2 gap-2 border-t border-line bg-panel p-3 [&>button]:w-full'
                : 'flex flex-wrap justify-end gap-2 border-t border-line pt-3'
            )}
          >
            {claim.state === 'pending' ? (
              <>
                <Button aria-disabled={ctx.busy || undefined} onClick={() => ctx.onReject(claim)}>
                  {t('srp.officer.actions.reject')}
                </Button>
                <Button
                  variant="success"
                  aria-disabled={blocked || undefined}
                  onClick={() => ctx.onApprove(claim)}
                >
                  {t('srp.officer.actions.approve')}
                </Button>
              </>
            ) : (
              <>
                <CopyAmount claim={claim} ctx={ctx} />
                <Button
                  variant="success"
                  aria-disabled={ctx.busy || undefined}
                  onClick={() => ctx.onMarkPaid(claim)}
                >
                  {t('srp.officer.actions.markPaid')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </SlideOver>
  );
}
