import type { TFunction } from 'i18next';
import type { SrpClaim } from '../srpClaimTypes';
import { approveAmount } from './srpQueue';
import type { SrpClaimNames } from './useSrpClaimNames';

export interface ClaimColumnsContext {
  t: TFunction;
  names: SrpClaimNames;
  zone: 'UTC' | undefined;
  selected: readonly number[];
  onToggle: (killmailId: number) => void;
  typed: Readonly<Record<number, string>>;
  onType: (killmailId: number, text: string) => void;
  onApprove: (claim: SrpClaim) => void;
  onReject: (claim: SrpClaim) => void;
  onMarkPaid: (claim: SrpClaim) => void;
  onCopy: (claim: SrpClaim) => void;
  copiedId: number | null;
  selfCharacterId?: number | null;
  busy: boolean;
}

export function ownClaimReason(claim: SrpClaim, ctx: ClaimColumnsContext): string | undefined {
  return ctx.selfCharacterId != null && claim.characterId === ctx.selfCharacterId
    ? ctx.t('srp.officer.failed.own-claim')
    : undefined;
}

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
