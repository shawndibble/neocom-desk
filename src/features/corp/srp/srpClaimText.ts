import type { TFunction } from 'i18next';
import { callableErrorReason } from '@/lib/callableError';
import { formatIsk } from '@/lib/isk';
import type { SrpClaim } from '../srpClaimTypes';
import type { SrpClaimBasis } from '../srpTypes';

export const decidedLine = (claim: SrpClaim) => ({
  at: claim.paidAt ?? claim.decidedAt,
  by: claim.paidByName ?? claim.decidedByName,
});

export function basisText(t: TFunction, basis: SrpClaimBasis): string {
  return 'percent' in basis
    ? t(`srp.officer.basis.${basis.step}`, { percent: basis.percent })
    : t(`srp.officer.basis.${basis.step}`);
}

export function claimBasisLine(t: TFunction, claim: SrpClaim): string {
  if (claim.basis) return basisText(t, claim.basis);
  if (claim.amount !== null) return '';
  return claim.suggested
    ? t('srp.officer.basis.suggested', {
        isk: formatIsk(claim.suggested.isk),
        basis: basisText(t, claim.suggested.basis),
      })
    : t('srp.officer.basis.none');
}

export function failureText(t: TFunction, error: unknown): string {
  const reason = callableErrorReason(error);
  const known = reason === null ? '' : t(`srp.officer.failed.${reason}`, { defaultValue: '' });
  return known === '' ? t('srp.officer.failed.generic') : known;
}
