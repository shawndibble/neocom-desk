/**
 * The mail an SRP officer's client sends a pilot when a claim is approved or rejected. Best effort, sent from the officer's own Character with their own token
 * after the callable succeeded: a failed mail never undoes or blocks the decision, the in-app
 * state is the record. It rides the paced Officer mail queue, not a direct send. The builder
 * and the summary are pure.
 */
import type { TFunction } from 'i18next';
import { clipToCodePoints, MAX_MAIL_SUBJECT } from '@/engine/communities/requestMail';
import { formatIsk } from '@/lib/isk';
import { mailSafe } from '@/lib/mailSafe';
import { enqueueSrpResultMails } from '@/features/corpTaxBook/mailQueue';
import { queueOfficerMail } from '@/features/corpTaxBook/officerMail';

export type SrpMailKind = 'approved' | 'rejected';

/** One decided claim, as the pilot reads it. */
export interface SrpMailClaim {
  killmailId: number;
  hull: string;
  /** Whole ISK; approved mails only. */
  amount?: number;
  /** Rejected mails only. */
  reason?: string;
}

export interface SrpMailPilot {
  characterId: number;
  characterName: string;
  claims: SrpMailClaim[];
}

export function buildSrpResultMail(
  t: TFunction,
  input: { kind: SrpMailKind; pilot: string; corpName: string; claims: readonly SrpMailClaim[] }
): { subject: string; body: string } {
  const { kind, claims } = input;
  const count = claims.length;
  const lines = claims.map((c) =>
    kind === 'approved'
      ? t('srp.officer.mail.approvedLine', {
          hull: mailSafe(c.hull),
          id: c.killmailId,
          isk: formatIsk(c.amount ?? 0),
        })
      : t('srp.officer.mail.rejectedLine', {
          hull: mailSafe(c.hull),
          id: c.killmailId,
          reason: mailSafe(c.reason ?? ''),
        })
  );
  const subject = t(`srp.officer.mail.${kind}Subject`, {
    count,
    hull: mailSafe(claims[0]?.hull ?? ''),
  });
  return {
    subject: clipToCodePoints(subject, MAX_MAIL_SUBJECT),
    body: [
      t('srp.officer.mail.greeting', { pilot: mailSafe(input.pilot) }),
      t(`srp.officer.mail.${kind}Intro`, { count }),
      lines.join('\n'),
      t(`srp.officer.mail.${kind}Outro`, { count, corp: mailSafe(input.corpName) }),
    ].join('\n\n'),
  };
}

/** Group decided claims by pilot, so a pilot with several gets one mail. A claim with no pilot id is skipped. */
export function groupByPilot(
  items: readonly {
    characterId: number | null;
    characterName: string | null;
    claim: SrpMailClaim;
  }[]
): SrpMailPilot[] {
  const byId = new Map<number, SrpMailPilot>();
  for (const { characterId, characterName, claim } of items) {
    if (characterId === null) continue;
    const pilot = byId.get(characterId) ?? {
      characterId,
      characterName: characterName ?? `#${characterId}`,
      claims: [],
    };
    pilot.claims.push(claim);
    byId.set(characterId, pilot);
  }
  return [...byId.values()];
}

export interface MailRun {
  /** Pilots whose mail is on the paced send queue (it goes out about 5 a minute). */
  queued: string[];
  /** Pilots whose mail could not be queued; the decision stands. */
  failed: string[];
  /** The officer's Character cannot send mail, so none was tried. */
  missingScope: boolean;
}

/**
 * One mail per pilot, put on the Officer mail queue (one place that paces every Officer mail,
 * so a dozen pilots do not trip EVE's spam limit). Never throws.
 */
export async function queueSrpResultMails(
  t: TFunction,
  input: {
    kind: SrpMailKind;
    corpName: string;
    pilots: readonly SrpMailPilot[];
    senderCharacterId: number;
    /** The officer's corporation; null while unknown (the mail does not need it). */
    corporationId: number | null;
  }
): Promise<MailRun> {
  const { pilots } = input;
  const run: MailRun = { queued: [], failed: [], missingScope: false };
  if (pilots.length === 0) return run;
  const byId = new Map(pilots.map((p) => [p.characterId, p]));
  const out = await queueOfficerMail({
    senderCharacterId: input.senderCharacterId,
    recipients: pilots.map((p) => p.characterId),
    knownNames: new Map(pilots.map((p) => [p.characterId, p.characterName])),
    enqueue: (recipients) =>
      enqueueSrpResultMails({
        // The queue row only scopes by corporation; the mail needs none, so an unresolved one is 0.
        corporationId: input.corporationId ?? 0,
        senderCharacterId: input.senderCharacterId,
        kind: input.kind,
        mails: recipients.map((recipient) => {
          const claims = byId.get(recipient.id)?.claims ?? [];
          return {
            recipient,
            killmailIds: claims.map((c) => c.killmailId),
            ...buildSrpResultMail(t, {
              kind: input.kind,
              pilot: recipient.name,
              corpName: input.corpName,
              claims,
            }),
          };
        }),
      }),
  });
  if (out.status === 'queued') {
    // Only the mails really queued: a repeat of one decision queues none.
    return { ...run, queued: pilots.slice(0, out.queued).map((p) => p.characterName) };
  }
  if (out.status === 'no-scope') return { ...run, missingScope: true };
  return { ...run, failed: pilots.map((p) => p.characterName) };
}

/** The mail half of the result line; empty when there was nothing to mail. */
export function mailSummary(t: TFunction, run: MailRun): string {
  if (run.missingScope) return t('srp.officer.mail.noScope');
  return [
    run.queued.length > 0 ? t('srp.officer.mail.queuedFor', { count: run.queued.length }) : '',
    run.failed.length > 0 ? t('srp.officer.mail.failedFor', { names: run.failed.join(', ') }) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** `head` then the mail summary, as one toast line. */
export function withMailSummary(t: TFunction, head: string, run: MailRun): string {
  const tail = mailSummary(t, run);
  return tail === '' ? head : `${head}${/[.!?]$/.test(head) ? '' : '.'} ${tail}`;
}
