import { db, type MailDraftRecipient, type MailDraftRecord } from '@/db';

function draftId(characterId: number, mailId: number): string {
  return `${characterId}:${mailId}`;
}

export type { MailDraftRecipient, MailDraftRecord };

export function loadDraft(
  characterId: number,
  mailId: number
): Promise<MailDraftRecord | undefined> {
  return db.mailDrafts.get(draftId(characterId, mailId));
}

export function saveDraft(
  characterId: number,
  mailId: number,
  kind: 'reply' | 'forward',
  recipients: readonly MailDraftRecipient[],
  subject: string,
  body: string
): Promise<string> {
  return db.mailDrafts.put({
    id: draftId(characterId, mailId),
    characterId,
    mailId,
    kind,
    recipients: [...recipients],
    subject,
    body,
    format: 'markup',
    updatedAt: Date.now(),
  });
}

export function clearDraft(characterId: number, mailId: number): Promise<void> {
  return db.mailDrafts.delete(draftId(characterId, mailId));
}

function newMailDraftId(characterId: number): string {
  return `${characterId}:new`;
}

export async function loadNewMailDraft(characterId: number): Promise<MailDraftRecord | undefined> {
  return db.mailDrafts.get(newMailDraftId(characterId));
}

export function saveNewMailDraft(
  characterId: number,
  recipients: readonly MailDraftRecipient[],
  subject: string,
  body: string
): Promise<string> {
  return db.mailDrafts.put({
    id: newMailDraftId(characterId),
    characterId,
    mailId: 0,
    kind: 'new',
    recipients: recipients.map(({ recipient_id, recipient_type, name }) => ({
      recipient_id,
      recipient_type,
      ...(name === undefined ? {} : { name }),
    })),
    subject,
    body,
    format: 'markup',
    updatedAt: Date.now(),
  });
}

export function clearNewMailDraft(characterId: number): Promise<void> {
  return db.mailDrafts.delete(newMailDraftId(characterId));
}
