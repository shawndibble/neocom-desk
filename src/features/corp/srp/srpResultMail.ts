/**
 * The mail an SRP officer's client sends a pilot when a claim is approved or rejected. Best effort, sent from the officer's own Character with their own token
 * after the callable succeeded: a failed mail never undoes or blocks the decision, the in-app
 * state is the record. The builder and the summary are pure; `sendSrpResultMails` takes `send`.
 */
import type { TFunction } from 'i18next';
import { clipToCodePoints, MAX_MAIL_SUBJECT } from '@/engine/communities/requestMail';
import { formatIsk } from '@/lib/isk';
import { mailSafe } from '@/lib/mailSafe';

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
  /** Pilots mailed. */
  sent: string[];
  /** Pilots whose mail failed; the decision stands. */
  failed: string[];
  /** The officer's Character cannot send mail, so none was tried. */
  missingScope: boolean;
}

/** ESI's error budget or rate limit: further sends this round would only fail. */
const isThrottle = (error: unknown) => {
  const status = (error as { status?: unknown } | null)?.status;
  return status === 420 || status === 429;
};

/** One mail per pilot, one after another, so ESI's limits are respected. Never throws. */
export async function sendSrpResultMails(
  t: TFunction,
  input: { kind: SrpMailKind; corpName: string; pilots: readonly SrpMailPilot[] },
  deps: {
    hasScope: boolean;
    send: (recipientId: number, subject: string, body: string) => Promise<unknown>;
  }
): Promise<MailRun> {
  const run: MailRun = { sent: [], failed: [], missingScope: false };
  if (input.pilots.length === 0) return run;
  if (!deps.hasScope) return { ...run, missingScope: true };
  let throttled = false;
  for (const pilot of input.pilots) {
    if (throttled) {
      run.failed.push(pilot.characterName);
      continue;
    }
    const { subject, body } = buildSrpResultMail(t, {
      kind: input.kind,
      pilot: pilot.characterName,
      corpName: input.corpName,
      claims: pilot.claims,
    });
    try {
      await deps.send(pilot.characterId, subject, body);
      run.sent.push(pilot.characterName);
    } catch (error) {
      throttled = isThrottle(error);
      run.failed.push(pilot.characterName);
    }
  }
  return run;
}

/** The mail half of the result line; empty when there was nothing to mail. */
export function mailSummary(t: TFunction, run: MailRun): string {
  if (run.missingScope) return t('srp.officer.mail.noScope');
  return [
    run.sent.length > 0 ? t('srp.officer.mail.sentTo', { count: run.sent.length }) : '',
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
