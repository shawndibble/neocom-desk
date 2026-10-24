/** Cells the officer queue's columns and claim detail share. */
import type { ReactElement, ReactNode } from 'react';
import { Button, Checkbox, IskInput, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Pill } from '@/components/ui/Pill';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { formatIsk } from '@/lib/isk';
import type { SrpClaim } from '../srpClaimTypes';
import { ownClaimReason, type ClaimColumnsContext } from './claimColumnsContext';
import { claimBasisLine } from './srpClaimText';
import { approveAmount } from './srpQueue';

const STATE_TONE = {
  pending: 'warning',
  approved: 'warning',
  paid: 'success',
  rejected: 'danger',
} as const;

/** A decide button with its reason in a tooltip while it is inert for this officer. */
export function DecideTip({
  reason,
  children,
}: {
  reason: string | undefined;
  children: ReactElement<{ className?: string }>;
}) {
  return reason === undefined ? children : <Tooltip content={reason}>{children}</Tooltip>;
}

/** A claim's state as a pill. */
export function ClaimStatePill({ claim, ctx }: { claim: SrpClaim; ctx: ClaimColumnsContext }) {
  return <Pill tone={STATE_TONE[claim.state]}>{ctx.t(`srp.officer.states.${claim.state}`)}</Pill>;
}

/** The queue's flag for a claim whose fit matched no Doctrine Fit; the detail has the diff. */
export function OffDoctrineFlag({ claim, ctx }: { claim: SrpClaim; ctx: ClaimColumnsContext }) {
  if (claim.doctrineCheck?.status !== 'off-doctrine') return null;
  return <Pill tone="warning">{ctx.t('srp.doctrine.queueFlag')}</Pill>;
}

export function Pilot({ claim, ctx }: { claim: SrpClaim; ctx: ClaimColumnsContext }) {
  return (
    <span className="block min-w-0">
      <span className="font-semibold">{claim.characterName}</span>
      <span className="block text-xs">
        <ExternalLink href={`https://zkillboard.com/kill/${claim.killmailId}/`}>
          {ctx.t('srp.officer.killmailLink')}
        </ExternalLink>
      </span>
    </span>
  );
}

export function SelectBox({
  claim,
  ctx,
  show,
}: {
  claim: SrpClaim;
  ctx: ClaimColumnsContext;
  show: boolean;
}): ReactNode {
  if (!show) return null;
  const reason = ownClaimReason(claim, ctx);
  return (
    <DecideTip reason={reason}>
      <label className={touchCheckboxLabelClassName}>
        <Checkbox
          aria-label={ctx.t('srp.officer.actions.select', {
            pilot: claim.characterName,
            hull: ctx.names.hull(claim.hullTypeId),
          })}
          checked={ctx.selected.includes(claim.killmailId)}
          aria-disabled={reason !== undefined || undefined}
          onChange={() => reason === undefined && ctx.onToggle(claim.killmailId)}
        />
      </label>
    </DecideTip>
  );
}

/** The field a claim with no worked-out amount shows in place of a figure. */
export function TypeAmountField({
  claim,
  ctx,
  className,
}: {
  claim: SrpClaim;
  ctx: ClaimColumnsContext;
  className?: string;
}) {
  return (
    <IskInput
      value={ctx.typed[claim.killmailId] ?? ''}
      onChange={(text) => ctx.onType(claim.killmailId, text)}
      aria-label={ctx.t('srp.officer.amountFor', { pilot: claim.characterName })}
      placeholder={ctx.t('srp.officer.typeAmount')}
      className={className}
    />
  );
}

/** The figure and, under it, how it was reached (or that an officer changed it). */
export function AmountCell({ claim, ctx }: { claim: SrpClaim; ctx: ClaimColumnsContext }) {
  const { t } = ctx;
  return (
    <span className="block text-right tabular-nums max-sm:text-left">
      <span className="font-semibold">
        {ctx.t('srp.officer.iskAmount', { isk: formatIsk(claim.amount ?? 0) })}
      </span>
      {claim.computedAmount !== undefined && claim.overrideByName ? (
        <span className="block text-xs text-text-dim">
          {claim.computedAmount !== null && (
            <>
              <span className="line-through">{formatIsk(claim.computedAmount)}</span>{' '}
            </>
          )}
          {t(
            claim.amountSource === 'typed'
              ? 'srp.officer.amountTyped'
              : 'srp.officer.amountChanged',
            {
              name: claim.overrideByName,
            }
          )}
        </span>
      ) : (
        <span className="block text-xs text-text-dim">{claimBasisLine(t, claim)}</span>
      )}
    </span>
  );
}

export function PendingAmount({ claim, ctx }: { claim: SrpClaim; ctx: ClaimColumnsContext }) {
  if (claim.amount !== null) return <AmountCell claim={claim} ctx={ctx} />;
  return (
    <span className="block space-y-1">
      <TypeAmountField claim={claim} ctx={ctx} />
      <span className="block text-xs text-warning">{claimBasisLine(ctx.t, claim)}</span>
    </span>
  );
}

export function ApproveReject({
  claim,
  ctx,
  className,
}: {
  claim: SrpClaim;
  ctx: ClaimColumnsContext;
  className?: string;
}) {
  const own = ownClaimReason(claim, ctx);
  const blocked =
    ctx.busy || own !== undefined || approveAmount(claim, ctx.typed[claim.killmailId]) === null;
  return (
    <>
      <DecideTip reason={own}>
        <Button
          size="sm"
          variant="success"
          className={className}
          aria-disabled={blocked || undefined}
          onClick={() => ctx.onApprove(claim)}
        >
          {ctx.t('srp.officer.actions.approve')}
        </Button>
      </DecideTip>
      <DecideTip reason={own}>
        <Button
          size="sm"
          className={className}
          aria-disabled={ctx.busy || own !== undefined || undefined}
          onClick={() => ctx.onReject(claim)}
        >
          {ctx.t('srp.officer.actions.reject')}
        </Button>
      </DecideTip>
    </>
  );
}

/** A copy button for the bare amount, so the officer can paste it into the in-game wallet. */
export function CopyAmount({
  claim,
  ctx,
  wide,
}: {
  claim: SrpClaim;
  ctx: ClaimColumnsContext;
  wide?: boolean;
}) {
  const copied = ctx.copiedId === claim.killmailId;
  const { t } = ctx;
  return (
    <Button
      size="sm"
      aria-label={t('srp.officer.actions.copyLabel', {
        isk: formatIsk(claim.amount ?? 0),
        pilot: claim.characterName,
      })}
      className="shrink-0"
      onClick={() => ctx.onCopy(claim)}
    >
      {copied ? (
        <Icon.Done size={Icon.ICON_SIZE.sm} />
      ) : (
        <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} />
      )}
      {t(
        copied
          ? 'srp.officer.actions.copied'
          : wide
            ? 'srp.officer.actions.copyAmount'
            : 'srp.officer.actions.copy'
      )}
    </Button>
  );
}

/** Two equal 44px buttons side by side. */
export function ButtonPair({ children }: { children: ReactNode }) {
  return (
    <span className="grid grid-cols-2 gap-2 [&>button]:w-full [&>button]:px-2 [&>button]:whitespace-nowrap">
      {children}
    </span>
  );
}
