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
  role?: string;
  pilot: string;
  corpName: string;
  wording: VettingRejection['wording'];
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

export function offersDecisionMail(
  review: Pick<VettingReview, 'state' | 'signOffs'>,
  settings: Pick<VettingSettings, 'mailDecision'> | null
): boolean {
  if (review.state !== 'accepted' && review.state !== 'rejected') return false;
  return settings?.mailDecision === true && review.signOffs.some((signOff) => signOff.you);
}

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
