/**
 * The one door for mail an Officer's client sends: every such mail goes through the paced,
 * persistent send queue (`mailQueue.ts` + `MailQueueHost`), never straight to ESI, because EVE
 * answers 520 MailStopSpamming past about 5 mails a minute from a character.
 *
 * Three things every caller used to repeat live here once: "can this officer send mail", "who
 * are these ids" (`#id` when a name is unknown) and "queue it after the change was saved, and
 * never undo that change if queueing fails".
 */
import { db } from '@/db';
import type { Translate } from '@/lib/translate';
import { requiredScopesForEndpoints, SEND_MAIL_ENDPOINTS } from '@/esi/registry';

const SEND_MAIL_SCOPES = requiredScopesForEndpoints(SEND_MAIL_ENDPOINTS);

/** Whether a granted-scope list lets the character send mail. The one check. */
export function canSendMail(grantedScopes: readonly string[] | undefined): boolean {
  return grantedScopes !== undefined && SEND_MAIL_SCOPES.every((s) => grantedScopes.includes(s));
}

export interface MailRecipient {
  id: number;
  name: string;
}

/**
 * Names for recipient ids, in order. `known` wins over a lookup; an id nobody can name
 * (or a failed lookup) reads `#id`.
 */
export async function resolveRecipients(
  ids: readonly number[],
  known: ReadonlyMap<number, string> = new Map()
): Promise<MailRecipient[]> {
  const unknown = ids.filter((id) => !known.has(id));
  let looked = new Map<number, string>();
  if (unknown.length > 0) {
    try {
      const { resolveNames } = await import('@/features/character/names');
      looked = await resolveNames(unknown);
    } catch {
      // A name is a nicety: the mail still goes, addressed by id.
    }
  }
  return ids.map((id) => ({ id, name: known.get(id) ?? looked.get(id) ?? `#${id}` }));
}

export type OfficerMailOutcome =
  | { status: 'queued'; queued: number }
  /** The sender's token lacks the mail permission; nothing was tried. */
  | { status: 'no-scope' }
  /** Nobody to tell. */
  | { status: 'none' }
  /** Queueing failed; the change it follows stands. */
  | { status: 'failed' };

export interface OfficerMailInput {
  /** The officer's Character the mail goes from. */
  senderCharacterId: number;
  /** Scopes the caller already holds; read from the sender's token (at call time) when omitted. */
  grantedScopes?: readonly string[] | undefined;
  /** Character ids to mail, or how to find them. */
  recipients: readonly number[] | (() => Promise<readonly number[]>);
  /** Names the caller already has, so no lookup is needed. */
  knownNames?: ReadonlyMap<number, string>;
  /** Puts one queue row per recipient on the queue (`mailQueue.ts`'s `enqueue*`). */
  enqueue: (recipients: MailRecipient[]) => Promise<{ queued: number }>;
}

/**
 * Queues an Officer mail after the change it tells people about was saved. Never throws and
 * never blocks the change: whatever goes wrong comes back as an outcome.
 */
export async function queueOfficerMail(input: OfficerMailInput): Promise<OfficerMailOutcome> {
  try {
    const scopes =
      input.grantedScopes ?? (await db.tokens.get(input.senderCharacterId))?.scopes ?? [];
    const { recipients } = input;
    if (typeof recipients !== 'function' && recipients.length === 0) return { status: 'none' };
    if (!canSendMail(scopes)) return { status: 'no-scope' };
    const found = typeof recipients === 'function' ? await recipients() : recipients;
    if (found.length === 0) return { status: 'none' };
    const { queued } = await input.enqueue(await resolveRecipients(found, input.knownNames));
    return { status: 'queued', queued };
  } catch {
    return { status: 'failed' };
  }
}

/** What became of a batch of Officer mails, for the line that reports it. */
export interface MailRun {
  /** Pilots whose mail is on the paced send queue (it goes out about 5 a minute). */
  queued: string[];
  /** Pilots whose mail could not be queued; the change it follows stands. */
  failed: string[];
  /** The officer's Character cannot send mail, so none was tried. */
  missingScope: boolean;
}

/** A `MailRun` as one line; empty when there was nothing to mail. */
export function mailSummary(t: Translate, run: MailRun): string {
  if (run.missingScope) return t('srp.officer.mail.noScope');
  return [
    run.queued.length > 0 ? t('srp.officer.mail.queuedFor', { count: run.queued.length }) : '',
    run.failed.length > 0 ? t('srp.officer.mail.failedFor', { names: run.failed.join(', ') }) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** The corporation's name for an Officer mail, or null when it cannot be read (the caller has a fallback). */
export async function officerCorporationName(corporationId: number): Promise<string | null> {
  try {
    const { loadPublicCorporationRecord } = await import('@/features/character/publicInfoData');
    return (await loadPublicCorporationRecord(corporationId))?.name ?? null;
  } catch {
    return null;
  }
}
