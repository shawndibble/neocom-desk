import {
  VETTING_KEEP_DAYS,
  type VettingMinimumId,
  type VettingRejection,
  type VettingReviewSummary,
  type VettingState,
  type VettingStatus,
} from '@/engine/vetting';
import { formatCount } from '@/lib/formatCount';
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

/** The apply page's router path: `/apply/<corporationId>`, with the invite code when there is one. */
export function applyPath(corporationId: number, invite?: string): string {
  const code = invite?.trim() ?? '';
  return `/apply/${corporationId}${code === '' ? '' : `?invite=${encodeURIComponent(code)}`}`;
}

/** The link a corp sends applicants: this app's origin and `applyPath`. */
export function applyLink(corporationId: number, invite?: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}${applyPath(corporationId, invite)}`;
}

/** One minimum a corp asks, as the applicant reads it: "A character at least 365 days old". */
export function minimumLine(id: VettingMinimumId, value: number, t: Translate): string {
  return t(`vetting.asks.${id}`, { count: value, amount: formatCount(value) });
}

/** "Rejected" or the corp's softer "Not at this time"; every other state reads as itself. */
export function statusStateLabel(
  status: Pick<VettingStatus, 'state' | 'rejection'>,
  t: Translate
): string {
  return status.state === 'rejected'
    ? rejectionLabel(status.rejection?.wording ?? 'rejected', t)
    : t(`vetting.status.state.${status.state}`);
}

export function rejectionLabel(wording: VettingRejection['wording'], t: Translate): string {
  return t(`vetting.rejection.${wording}`);
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
