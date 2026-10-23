/** Words for a claim's amount basis and a refusal from the officer callables (issue #4853). */
import type { TFunction } from 'i18next';
import { callableErrorReason } from '@/lib/callableError';
import { formatIsk } from '@/lib/isk';
import type { SrpClaim } from '../srpClaimTypes';
import type { SrpClaimBasis } from '../srpTypes';

export function basisText(t: TFunction, basis: SrpClaimBasis): string {
  return 'percent' in basis
    ? t(`srp.officer.basis.${basis.step}`, { percent: basis.percent })
    : t(`srp.officer.basis.${basis.step}`);
}

/** What the amount line under a figure says: how it was worked out, or that an officer decides. */
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

/** A refusal as text: the callable's reason, else a generic line. Never the server's English. */
export function failureText(t: TFunction, error: unknown): string {
  const reason = callableErrorReason(error);
  const known = reason === null ? '' : t(`srp.officer.failed.${reason}`, { defaultValue: '' });
  return known === '' ? t('srp.officer.failed.generic') : known;
}
