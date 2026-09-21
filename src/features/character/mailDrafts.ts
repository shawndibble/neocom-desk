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
    updatedAt: Date.now(),
  });
}

/** Called once a send succeeds, or when a pilot explicitly discards the draft. */
export function clearDraft(characterId: number, mailId: number): Promise<void> {
  return db.mailDrafts.delete(draftId(characterId, mailId));
}
