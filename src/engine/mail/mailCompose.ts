import { eveMarkupLength } from './eveMarkup';

export const MAX_RECIPIENTS = 50;
export const MAX_SUBJECT_LENGTH = 1000;
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

export function composeBodyLength(body: string): number {
  return eveMarkupLength(body);
}

export type AddRecipientResult =
  | { ok: true; recipients: ComposeRecipient[] }
  | { ok: false; reason: 'duplicate' | 'full'; recipients: ComposeRecipient[] };

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

export function validateNewMail(mail: NewMailFields): NewMailProblem[] {
  const problems: NewMailProblem[] = [];
  if (mail.recipients.length === 0) problems.push('noRecipients');
  if (mail.recipients.length > MAX_RECIPIENTS) problems.push('tooManyRecipients');
  if (mail.subject.length > MAX_SUBJECT_LENGTH) problems.push('subjectTooLong');
  if (composeBodyLength(mail.body) > MAX_BODY_LENGTH) problems.push('bodyTooLong');
  return problems;
}

export function isNewMailEmpty(mail: NewMailFields): boolean {
  return mail.recipients.length === 0 && mail.subject.trim() === '' && mail.body.trim() === '';
}

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
