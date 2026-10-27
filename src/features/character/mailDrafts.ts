/**
 * Reply/Forward drafts (mail-reply-and-forward decision,
 * docs/context/decisions/): one row per source mail, device-local, cleared on
 * send. `db.mailDrafts` is the only store — no sync, no freshness window, the
 * same tier as `db.tokens`.
 */
import { db, type MailDraftRecipient, type MailDraftRecord } from '@/db';

function draftId(characterId: number, mailId: number): string {
  return `${characterId}:${mailId}`;
}

export type { MailDraftRecipient, MailDraftRecord };

/** The one draft for this mail, if a pilot has started (and not sent) one. */
export function loadDraft(
  characterId: number,
  mailId: number
): Promise<MailDraftRecord | undefined> {
  return db.mailDrafts.get(draftId(characterId, mailId));
}

/** Upserts the draft in progress — every compose-box edit calls this, overwriting the prior save. */
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

/** Called once a send succeeds, or when a pilot explicitly discards the draft. */
export function clearDraft(characterId: number, mailId: number): Promise<void> {
  return db.mailDrafts.delete(draftId(characterId, mailId));
}

// --- New Mail: one slot per Character, reopened as left -------------------

function newMailDraftId(characterId: number): string {
  return `${characterId}:new`;
}

/** The Character's unsent New Mail, if any. */
export async function loadNewMailDraft(characterId: number): Promise<MailDraftRecord | undefined> {
  return db.mailDrafts.get(newMailDraftId(characterId));
}

/** Overwrites the New Mail slot. */
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

/** On send, on Discard, or when the draft has gone empty. */
export function clearNewMailDraft(characterId: number): Promise<void> {
  return db.mailDrafts.delete(newMailDraftId(characterId));
}
