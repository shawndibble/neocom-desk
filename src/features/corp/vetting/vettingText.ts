import type { VettingReviewSummary } from '@/engine/vetting';
import type { Translate } from '@/lib/translate';

/** "Application", or "Promotion to Director". */
export function reviewKindLabel(
  review: Pick<VettingReviewSummary, 'kind' | 'role'>,
  t: Translate
): string {
  return review.kind === 'promotion'
    ? t('vetting.kind.promotionTo', { role: review.role ?? '' })
    : t('vetting.kind.application');
}

/** The link a corp sends applicants: this app's origin, `/apply/<corporationId>`. */
export function applyLink(corporationId: number): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}apply/${corporationId}`;
}
