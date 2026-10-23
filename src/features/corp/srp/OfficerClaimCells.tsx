/** Cells the officer queue's columns and claim detail share (issue #4853). */
import type { ReactNode } from 'react';
import { Button, Checkbox, IskInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { formatIsk } from '@/lib/isk';
import type { SrpClaim } from '../srpClaimTypes';
import type { ClaimColumnsContext } from './claimColumnsContext';
import { claimBasisLine } from './srpClaimText';
import { approveAmount } from './srpQueue';

const iskText = (value: number) => `${formatIsk(value)} ISK`;

export function Pilot({ claim }: { claim: SrpClaim }) {
  return (
    <span className="block min-w-0">
      <span className="font-semibold">{claim.characterName}</span>
      <span className="block text-xs text-text-dim">{claim.killmailId}</span>
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
  return (
    <label className={touchCheckboxLabelClassName}>
      <Checkbox
        aria-label={ctx.t('srp.officer.actions.select', {
          pilot: claim.characterName,
          hull: ctx.names.hull(claim.hullTypeId),
        })}
        checked={ctx.selected.includes(claim.killmailId)}
        onChange={() => ctx.onToggle(claim.killmailId)}
      />
    </label>
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
      <span className="font-semibold">{iskText(claim.amount ?? 0)}</span>
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
  const blocked = ctx.busy || approveAmount(claim, ctx.typed[claim.killmailId]) === null;
  return (
    <>
      <Button
        size="sm"
        variant="success"
        className={className}
        aria-disabled={blocked || undefined}
        onClick={() => ctx.onApprove(claim)}
      >
        {ctx.t('srp.officer.actions.approve')}
      </Button>
      <Button
        size="sm"
        className={className}
        aria-disabled={ctx.busy || undefined}
        onClick={() => ctx.onReject(claim)}
      >
        {ctx.t('srp.officer.actions.reject')}
      </Button>
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
