import { VETTING_KEEP_DAYS, type VettingReviewSummary, type VettingState } from '@/engine/vetting';
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

/**
 * When a report is deleted, in words. A decided one has its date. One still waiting is deleted
 * `VETTING_KEEP_DAYS` after the decision, and its `deleteAt` is only the day it goes if nobody
 * decides, so the line says both.
 */
export function deletionLine(
  report: { state: VettingState; deleteAt: number | null },
  formatDate: (at: number) => string,
  t: Translate
): string {
  if (report.deleteAt === null) {
    return t('vetting.status.deletedAfter', { count: VETTING_KEEP_DAYS });
  }
  const date = formatDate(report.deleteAt);
  return report.state === 'open'
    ? t('vetting.status.deletedAfterOr', { count: VETTING_KEEP_DAYS, date })
    : date;
}
