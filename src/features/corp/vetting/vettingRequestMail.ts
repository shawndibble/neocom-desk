import type { TFunction } from 'i18next';
import { clipToCodePoints, MAX_MAIL_SUBJECT } from '@/engine/communities/requestMail';
import {
  VETTING_MAIL_COOLDOWN_MS,
  type VettingOverview,
  type VettingReview,
  type VettingReviewSummary,
} from '@/engine/vetting';
import { enqueueVettingRequestMail } from '@/features/corpTaxBook/mailQueue';
import { queueOfficerMail, type MailRun } from '@/features/corpTaxBook/officerMail';
import { mailSafe } from '@/lib/mailSafe';
import type { Translate } from '@/lib/translate';

export interface VettingRequestMailInput {
  pilot: string;
  role: string;
  corpName: string;
  officer: string;
  link: string;
}

export function buildVettingRequestMail(
  t: Translate,
  input: VettingRequestMailInput
): { subject: string; body: string } {
  const vars = {
    pilot: mailSafe(input.pilot),
    role: mailSafe(input.role),
    corp: mailSafe(input.corpName),
    link: input.link,
  };
  return {
    subject: clipToCodePoints(t('vetting.requestMail.subject', vars), MAX_MAIL_SUBJECT),
    body: [
      t('vetting.mail.greeting', { pilot: vars.pilot }),
      t('vetting.requestMail.asked', vars),
      t('vetting.requestMail.what'),
      t('vetting.requestMail.rights'),
      t('vetting.requestMail.open', vars),
      mailSafe(input.officer),
    ].join('\n\n'),
  };
}

export function requestMailInput(
  review: Pick<VettingReview, 'state' | 'role' | 'pilot'>,
  corpName: string,
  officer: string,
  link: string
): VettingRequestMailInput | null {
  if (review.state !== 'requested') return null;
  return { pilot: review.pilot.name, role: review.role ?? '', corpName, officer, link };
}

export function requestMailCooldown(
  mail: { sentAt: number } | undefined,
  now: number
): { remainingMs: number } | null {
  if (!mail) return null;
  const remainingMs = mail.sentAt + VETTING_MAIL_COOLDOWN_MS - now;
  return remainingMs > 0 ? { remainingMs } : null;
}

export interface RequestMailRun extends MailRun {
  cooldown?: boolean;
  unrecorded?: boolean;
}

export function mailGate(
  overview: Pick<VettingOverview, 'reviews'>,
  reviewId: string,
  officerId: number,
  now: number
):
  | { ok: true; review: VettingReviewSummary; previousSentAt: number }
  | { ok: false; reason: 'gone' | 'not-asker' | 'cooldown' } {
  const review = overview.reviews.find((r) => r.id === reviewId);
  if (!review || review.state !== 'requested') return { ok: false, reason: 'gone' };
  if (review.requestedBy?.characterId !== officerId) return { ok: false, reason: 'not-asker' };
  if (requestMailCooldown(review.requestMail, now)) return { ok: false, reason: 'cooldown' };
  return { ok: true, review, previousSentAt: review.requestMail?.sentAt ?? 0 };
}

export async function queueVettingRequestMail(
  t: TFunction,
  input: {
    corporationId: number;
    reviewId: string;
    senderCharacterId: number;
    pilotId: number;
    previousSentAt: number;
    mail: VettingRequestMailInput;
  }
): Promise<MailRun> {
  const run: MailRun = { queued: [], failed: [], missingScope: false };
  const name = input.mail.pilot;
  const out = await queueOfficerMail({
    senderCharacterId: input.senderCharacterId,
    recipients: [input.pilotId],
    knownNames: new Map([[input.pilotId, name]]),
    enqueue: ([recipient]) =>
      enqueueVettingRequestMail({
        corporationId: input.corporationId,
        senderCharacterId: input.senderCharacterId,
        reviewId: input.reviewId,
        sentSlot: input.previousSentAt,
        recipient,
        mail: buildVettingRequestMail(t, input.mail),
      }),
  });
  if (out.status === 'queued') return { ...run, queued: out.queued > 0 ? [name] : [] };
  if (out.status === 'no-scope') return { ...run, missingScope: true };
  return { ...run, failed: [name] };
}
