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

export function reviewKindLabel(
  review: Pick<VettingReviewSummary, 'kind' | 'role'>,
  t: Translate
): string {
  return review.kind === 'promotion'
    ? t('vetting.kind.promotionTo', { role: review.role ?? '' })
    : t('vetting.kind.application');
}

export function applyPath(corporationId: number, invite?: string): string {
  const code = invite?.trim() ?? '';
  return `/apply/${corporationId}${code === '' ? '' : `?invite=${encodeURIComponent(code)}`}`;
}

export function applyLink(corporationId: number, invite?: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}${applyPath(corporationId, invite)}`;
}

export function requestLink(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}/vetting`;
}

export function minimumLine(id: VettingMinimumId, value: number, t: Translate): string {
  return t(`vetting.asks.${id}`, { count: value, amount: formatCount(value) });
}

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
