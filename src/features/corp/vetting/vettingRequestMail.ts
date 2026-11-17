/**
 * The mail the asking officer's client offers to send a member once a review is requested. Sent
 * only on an explicit press, from the officer's own Character, by the paced Officer mail queue
 * (like `vettingDecisionMail.ts`). Its text is fixed: what is read is always said the same way.
 * The builder is pure.
 */
import type { TFunction } from 'i18next';
import { clipToCodePoints, MAX_MAIL_SUBJECT } from '@/engine/communities/requestMail';
import { VETTING_MAIL_COOLDOWN_MS, type VettingReview } from '@/engine/vetting';
import { enqueueVettingRequestMail } from '@/features/corpTaxBook/mailQueue';
import { queueOfficerMail, type MailRun } from '@/features/corpTaxBook/officerMail';
import { mailSafe } from '@/lib/mailSafe';
import type { Translate } from '@/lib/translate';

export interface VettingRequestMailInput {
  pilot: string;
  role: string;
  corpName: string;
  /** The asking officer, who signs the mail. */
  officer: string;
  /** Where the member opens the request. */
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

/** What the mail says, from the review the officer is looking at. Null once the member has shared. */
export function requestMailInput(
  review: Pick<VettingReview, 'state' | 'role' | 'pilot'>,
  corpName: string,
  officer: string,
  link: string
): VettingRequestMailInput | null {
  if (review.state !== 'requested') return null;
  return { pilot: review.pilot.name, role: review.role ?? '', corpName, officer, link };
}

/** How long until the mail may go again; null when it may now (never sent, or a day ago). */
export function requestMailCooldown(
  mail: { sentAt: number } | undefined,
  now: number
): { remainingMs: number } | null {
  if (!mail) return null;
  const remainingMs = mail.sentAt + VETTING_MAIL_COOLDOWN_MS - now;
  return remainingMs > 0 ? { remainingMs } : null;
}

/**
 * Puts the one mail on the Officer mail queue. Never throws. `previousSentAt` makes each resend a
 * new mail, and a double press before the server records it queues once.
 */
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
