import type { TFunction } from 'i18next';
import type { SrpClaim } from '../srpClaimTypes';
import { approveAmount } from './srpQueue';
import type { SrpClaimNames } from './useSrpClaimNames';

export interface ClaimColumnsContext {
  t: TFunction;
  names: SrpClaimNames;
  /** 'UTC' for EVE time, else the viewer's zone. */
  zone: 'UTC' | undefined;
  selected: readonly number[];
  onToggle: (killmailId: number) => void;
  /** Text typed into a no-amount claim's field, by killmail id. */
  typed: Readonly<Record<number, string>>;
  onType: (killmailId: number, text: string) => void;
  onApprove: (claim: SrpClaim) => void;
  onReject: (claim: SrpClaim) => void;
  onMarkPaid: (claim: SrpClaim) => void;
  onCopy: (claim: SrpClaim) => void;
  copiedId: number | null;
  /** The viewing officer's Character: a claim of theirs is decided by another officer. */
  selfCharacterId?: number | null;
  /** A change is in flight: row actions sit still until it lands. */
  busy: boolean;
}

/** Why the viewing officer cannot decide this claim (it is their own), or undefined. The server still checks. */
export function ownClaimReason(claim: SrpClaim, ctx: ClaimColumnsContext): string | undefined {
  return ctx.selfCharacterId != null && claim.characterId === ctx.selfCharacterId
    ? ctx.t('srp.officer.failed.own-claim')
    : undefined;
}

/** Why Approve is inert for this claim (its own, or no amount yet), or undefined. */
export function approveBlockedReason(
  claim: SrpClaim,
  ctx: ClaimColumnsContext
): string | undefined {
  return (
    ownClaimReason(claim, ctx) ??
    (approveAmount(claim, ctx.typed[claim.killmailId]) === null
      ? ctx.t('srp.officer.failed.needs-amount')
      : undefined)
  );
}
