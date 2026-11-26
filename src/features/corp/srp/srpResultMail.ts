import type { TFunction } from 'i18next';
import { clipToCodePoints, MAX_MAIL_SUBJECT } from '@/engine/communities/requestMail';
import { formatIsk } from '@/lib/isk';
import { mailSafe } from '@/lib/mailSafe';
import { enqueueSrpResultMails } from '@/features/corpTaxBook/mailQueue';
import { mailSummary, queueOfficerMail, type MailRun } from '@/features/corpTaxBook/officerMail';

export type SrpMailKind = 'approved' | 'rejected';

export interface SrpMailClaim {
  killmailId: number;
  hull: string;
  amount?: number;
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

export async function queueSrpResultMails(
  t: TFunction,
  input: {
    kind: SrpMailKind;
    corpName: string;
    pilots: readonly SrpMailPilot[];
    senderCharacterId: number;
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
    return { ...run, queued: pilots.slice(0, out.queued).map((p) => p.characterName) };
  }
  if (out.status === 'no-scope') return { ...run, missingScope: true };
  return { ...run, failed: pilots.map((p) => p.characterName) };
}

export function withMailSummary(t: TFunction, head: string, run: MailRun): string {
  const tail = mailSummary(t, run);
  return tail === '' ? head : `${head}${/[.!?]$/.test(head) ? '' : '.'} ${tail}`;
}
