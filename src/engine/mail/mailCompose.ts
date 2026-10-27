/**
 * New Mail compose rules (docs/context/decisions/
 * 20261016-124635-mail-compose-format-bar-and-eve-markup.md): who a mail can
 * go to, the ESI limits, and what an empty draft is. Pure — the composer, the
 * draft store and the recipient picker all lean on this.
 */
import { eveMarkupLength } from './eveMarkup';

/** ESI's cap on recipients per mail. */
export const MAX_RECIPIENTS = 50;
/** ESI's cap on a subject. */
export const MAX_SUBJECT_LENGTH = 1000;
/** ESI's cap on a body, markup included. */
export const MAX_BODY_LENGTH = 10_000;

export type ComposeRecipientType = 'character' | 'corporation' | 'alliance' | 'mailing_list';

export interface ComposeRecipient {
  recipient_id: number;
  recipient_type: ComposeRecipientType;
  name: string;
}

export interface NewMailFields {
  recipients: readonly ComposeRecipient[];
  subject: string;
  body: string;
}

export type NewMailProblem =
  'noRecipients' | 'tooManyRecipients' | 'subjectTooLong' | 'bodyTooLong';

export function recipientKey(r: Pick<ComposeRecipient, 'recipient_id' | 'recipient_type'>): string {
  return `${r.recipient_type}:${r.recipient_id}`;
}

/** Body length against `MAX_BODY_LENGTH`: EVE markup as sent, tags included. */
export function composeBodyLength(body: string): number {
  return eveMarkupLength(body);
}

export type AddRecipientResult =
  | { ok: true; recipients: ComposeRecipient[] }
  | { ok: false; reason: 'duplicate' | 'full'; recipients: ComposeRecipient[] };

/** Adds one recipient, refusing a repeat and anything past ESI's cap. */
export function addRecipient(
  current: readonly ComposeRecipient[],
  next: ComposeRecipient
): AddRecipientResult {
  const list = [...current];
  const key = recipientKey(next);
  if (list.some((r) => recipientKey(r) === key))
    return { ok: false, reason: 'duplicate', recipients: list };
  if (list.length >= MAX_RECIPIENTS) return { ok: false, reason: 'full', recipients: list };
  return { ok: true, recipients: [...list, next] };
}

/** Every reason Send must stay blocked; empty means the mail can go. */
export function validateNewMail(mail: NewMailFields): NewMailProblem[] {
  const problems: NewMailProblem[] = [];
  if (mail.recipients.length === 0) problems.push('noRecipients');
  if (mail.recipients.length > MAX_RECIPIENTS) problems.push('tooManyRecipients');
  if (mail.subject.length > MAX_SUBJECT_LENGTH) problems.push('subjectTooLong');
  if (composeBodyLength(mail.body) > MAX_BODY_LENGTH) problems.push('bodyTooLong');
  return problems;
}

/** Nothing worth keeping as a draft. */
export function isNewMailEmpty(mail: NewMailFields): boolean {
  return mail.recipients.length === 0 && mail.subject.trim() === '' && mail.body.trim() === '';
}

/** The joined mailing lists matching `query`, as recipients, by name, minus those already added. */
export function filterMailingLists(
  lists: readonly { mailing_list_id: number; name: string }[],
  query: string,
  added: readonly ComposeRecipient[]
): ComposeRecipient[] {
  const q = query.trim().toLowerCase();
  const taken = new Set(added.map(recipientKey));
  return lists
    .filter((l) => q === '' || l.name.toLowerCase().includes(q))
    .map((l): ComposeRecipient => ({
      recipient_id: l.mailing_list_id,
      recipient_type: 'mailing_list',
      name: l.name,
    }))
    .filter((r) => !taken.has(recipientKey(r)))
    .sort((a, b) => a.name.localeCompare(b.name));
}
