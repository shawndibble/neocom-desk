/**
 * The mail a reviewer's client offers to send a pilot once their vetting review is decided. Best
 * effort, from the reviewer's own Character with their own token, after the decision was saved:
 * a failed mail never undoes it. It rides the paced Officer mail queue, like an SRP result mail
 * (`srp/srpResultMail.ts`), and reports through the same `MailRun`. The builder is pure.
 *
 * A reason reaches the pilot only from a no stamped `reasonShown` when it was written, the same
 * rule the server uses for the pilot's own status page: a later change to the corp's setting
 * neither reveals an old note nor hides one the pilot already reads.
 */
import type { TFunction } from 'i18next';
import { clipToCodePoints, MAX_MAIL_SUBJECT } from '@/engine/communities/requestMail';
import type {
  VettingKind,
  VettingRejection,
  VettingReview,
  VettingSettings,
} from '@/engine/vetting';
import { enqueueVettingDecisionMail } from '@/features/corpTaxBook/mailQueue';
import { queueOfficerMail, type MailRun } from '@/features/corpTaxBook/officerMail';
import { mailSafe } from '@/lib/mailSafe';
import type { Translate } from '@/lib/translate';

export interface VettingDecisionMailInput {
  outcome: 'accepted' | 'rejected';
  kind: VettingKind;
  /** The role a promotion review was for. */
  role?: string;
  pilot: string;
  corpName: string;
  /** How the corp words a no. */
  wording: VettingRejection['wording'];
  /** The notes the pilot may read: each from a no the corp showed pilots when it was written. */
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
    subject = t(key(`${input.wording}Subject`), vars);
    paragraphs.push(t(key(input.wording), vars));
    const reasons = input.reasons.map((reason) => reason.trim()).filter(Boolean);
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
  wording: VettingRejection['wording'],
  corpName: string
): VettingDecisionMailInput | null {
  if (review.state !== 'accepted' && review.state !== 'rejected') return null;
  return {
    outcome: review.state,
    kind: review.kind,
    ...(review.role ? { role: review.role } : {}),
    pilot: review.pilot.name,
    corpName,
    wording,
    reasons: review.signOffs.flatMap((signOff) =>
      signOff.decision === 'no' && signOff.reasonShown === true && signOff.note
        ? [signOff.note]
        : []
    ),
  };
}

/**
 * Whether the reviewer is offered the mail: the review is decided, the corp wants a mail, and
 * the caller is one of its sign-offs. It reads the review alone, so a reload, a later visit or
 * the return from granting the mail permission offers it again.
 */
export function offersDecisionMail(
  review: Pick<VettingReview, 'state' | 'signOffs'>,
  settings: Pick<VettingSettings, 'mailDecision'> | null
): boolean {
  if (review.state !== 'accepted' && review.state !== 'rejected') return false;
  return settings?.mailDecision === true && review.signOffs.some((signOff) => signOff.you);
}

/**
 * Puts the one mail on the Officer mail queue. Never throws. A mail this device already queued
 * for the review is not queued twice: the run then comes back with nobody queued and nobody failed.
 */
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
