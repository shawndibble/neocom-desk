/**
 * The mail a reviewer's client offers to send a pilot once their vetting review is decided. Best
 * effort, from the reviewer's own Character with their own token, after the decision was saved:
 * a failed mail never undoes it. It rides the paced Officer mail queue, like an SRP result mail
 * (`srp/srpResultMail.ts`), and reports through the same `MailRun`. The builder is pure.
 */
import type { TFunction } from 'i18next';
import { clipToCodePoints, MAX_MAIL_SUBJECT } from '@/engine/communities/requestMail';
import type { VettingKind, VettingRejection, VettingReview } from '@/engine/vetting';
import { enqueueVettingDecisionMail } from '@/features/corpTaxBook/mailQueue';
import { queueOfficerMail } from '@/features/corpTaxBook/officerMail';
import { mailSafe } from '@/lib/mailSafe';
import type { Translate } from '@/lib/translate';
import type { MailRun } from '../srp/srpResultMail';

export interface VettingDecisionMailInput {
  outcome: 'accepted' | 'rejected';
  kind: VettingKind;
  /** The role a promotion review was for. */
  role?: string;
  pilot: string;
  corpName: string;
  rejection: VettingRejection;
  /** The notes of the reviewers who said no; written into the mail only when the corp shows them. */
  reasons: readonly string[];
}

export function buildVettingDecisionMail(
  t: Translate,
  input: VettingDecisionMailInput
): { subject: string; body: string } {
  const vars = { corp: mailSafe(input.corpName), role: mailSafe(input.role ?? '') };
  const key = (part: string) => `vetting.mail.${input.kind}.${part}`;
  const paragraphs = [t('vetting.mail.greeting', { pilot: mailSafe(input.pilot) })];
  let subject: string;
  if (input.outcome === 'accepted') {
    subject = t(key('acceptedSubject'), vars);
    paragraphs.push(t(key('accepted'), vars), t(key('acceptedNext'), vars));
  } else {
    const { wording, showReason } = input.rejection;
    subject = t(key(`${wording}Subject`), vars);
    paragraphs.push(t(key(wording), vars));
    const reasons = showReason ? input.reasons.map((reason) => reason.trim()).filter(Boolean) : [];
    if (reasons.length > 0) {
      paragraphs.push(
        reasons.map((reason) => t('vetting.mail.reason', { reason: mailSafe(reason) })).join('\n')
      );
    }
  }
  return { subject: clipToCodePoints(subject, MAX_MAIL_SUBJECT), body: paragraphs.join('\n\n') };
}

/** What a decided review's mail says, from the report the reviewer is looking at. Null while open. */
export function decisionMailInput(
  review: Pick<VettingReview, 'state' | 'kind' | 'role' | 'pilot' | 'signOffs'>,
  rejection: VettingRejection,
  corpName: string
): VettingDecisionMailInput | null {
  if (review.state !== 'accepted' && review.state !== 'rejected') return null;
  return {
    outcome: review.state,
    kind: review.kind,
    ...(review.role ? { role: review.role } : {}),
    pilot: review.pilot.name,
    corpName,
    rejection,
    reasons: review.signOffs.flatMap((signOff) =>
      signOff.decision === 'no' && signOff.note ? [signOff.note] : []
    ),
  };
}

/** Puts the one mail on the Officer mail queue. Never throws. */
export async function queueVettingDecisionMail(
  t: TFunction,
  input: {
    corporationId: number;
    reviewId: string;
    senderCharacterId: number;
    pilotId: number;
    mail: VettingDecisionMailInput;
  }
): Promise<MailRun> {
  const run: MailRun = { queued: [], failed: [], missingScope: false };
  const name = input.mail.pilot;
  const out = await queueOfficerMail({
    senderCharacterId: input.senderCharacterId,
    recipients: [input.pilotId],
    knownNames: new Map([[input.pilotId, name]]),
    enqueue: ([recipient]) =>
      enqueueVettingDecisionMail({
        corporationId: input.corporationId,
        senderCharacterId: input.senderCharacterId,
        reviewId: input.reviewId,
        recipient,
        mail: buildVettingDecisionMail(t, input.mail),
      }),
  });
  if (out.status === 'queued') return { ...run, queued: out.queued > 0 ? [name] : [] };
  if (out.status === 'no-scope') return { ...run, missingScope: true };
  return { ...run, failed: [name] };
}
