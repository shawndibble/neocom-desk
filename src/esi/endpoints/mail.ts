import { characterGet } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import type { EndpointOptions } from './options';

// --- GET /characters/{character_id}/mail (esi-mail.read_mail.v1) ---

/** One entry in a recipients list (mail header or body). */
export interface MailRecipient {
  recipient_id: number;
  recipient_type: 'alliance' | 'character' | 'corporation' | 'mailing_list';
}

/** Mail header: up to the 50 most recent, per ESI. */
export interface MailHeader {
  mail_id: number;
  from?: number;
  subject?: string;
  timestamp?: string;
  is_read?: boolean;
  labels?: number[];
  recipients?: MailRecipient[];
}

/**
 * `lastMailId` cursors older mail past ESI's 50-most-recent cap ("mails with
 * ID lower than this"), user-triggered per "load more" click rather than
 * auto-walked like `getCharacterWalletTransactions` (issue #161).
 */
export function getCharacterMailHeaders(
  characterId: number,
  options: EndpointOptions & { lastMailId?: number } = {}
): Promise<EsiResult<MailHeader[]>> {
  const { lastMailId, ...rest } = options;
  return esiFetch<MailHeader[]>(`/characters/${characterId}/mail`, {
    ...rest,
    characterId,
    endpointId: 'getCharacterMailHeaders',
    query: lastMailId === undefined ? undefined : { last_mail_id: lastMailId },
  });
}

// --- GET /characters/{character_id}/mail/{mail_id} (esi-mail.read_mail.v1) ---

/** Mail body. Note: uses `read`, distinct from the header's `is_read`. */
export interface MailBody {
  from?: number;
  subject?: string;
  timestamp?: string;
  body?: string;
  read?: boolean;
  labels?: number[];
  recipients?: MailRecipient[];
}

export function getCharacterMail(
  characterId: number,
  mailId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<MailBody>> {
  return esiFetch<MailBody>(`/characters/${characterId}/mail/${mailId}`, {
    ...options,
    characterId,
    endpointId: 'getCharacterMail',
  });
}

// --- GET /characters/{character_id}/mail/labels (esi-mail.read_mail.v1) ---

/** One of the character's mail labels — the four built-in System Labels plus any Custom Labels (out of scope for v1, see engine/mail.ts). */
export interface MailLabel {
  label_id: number;
  name?: string;
  unread_count?: number;
  color?: string;
}

export interface MailLabels {
  labels?: MailLabel[];
  total_unread_count?: number;
}

export function getCharacterMailLabels(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<MailLabels>> {
  return characterGet<MailLabels>('getCharacterMailLabels', characterId, options);
}

// --- GET /characters/{character_id}/mail/lists (esi-mail.read_mail.v1) ---

/** One mailing list the character belongs to — resolves a mailing_list recipient's real name (issue #416), in place of a generic fallback. */
export interface MailingList {
  mailing_list_id: number;
  name: string;
}

export function getCharacterMailingLists(
  characterId: number,
  options: EndpointOptions = {}
): Promise<EsiResult<MailingList[]>> {
  return characterGet<MailingList[]>('getCharacterMailingLists', characterId, options);
}

// --- PUT /characters/{character_id}/mail/{mail_id}/ (esi-mail.organize_mail.v1) ---

/** Marks a mail read (or unread). Answers 204 No Content on success. */
export function putCharacterMail(
  characterId: number,
  mailId: number,
  update: { read: boolean },
  options: { signal?: AbortSignal } = {}
): Promise<EsiResult<void>> {
  return esiFetch<void>(`/characters/${characterId}/mail/${mailId}/`, {
    ...options,
    characterId,
    method: 'PUT',
    body: update,
    endpointId: 'putCharacterMail',
  });
}

// --- POST /characters/{character_id}/mail/ (esi-mail.send_mail.v1) ---

/** What a Reply/Forward send actually posts. */
export interface MailSendBody {
  recipients: MailRecipient[];
  subject: string;
  body: string;
  /**
   * ISK the pilot approved to pay a recipient's contact charge (CSPA) — not
   * offered by this app (mail-reply-and-forward decision: no CSPA support).
   * Always omitted; kept on the type for fidelity to ESI's own request shape.
   */
  approved_cost?: number;
}

/** Answers the new mail's id on success. */
export function postCharacterMail(
  characterId: number,
  mail: MailSendBody,
  options: { signal?: AbortSignal } = {}
): Promise<EsiResult<number>> {
  return esiFetch<number>(`/characters/${characterId}/mail/`, {
    ...options,
    characterId,
    method: 'POST',
    body: mail,
    endpointId: 'postCharacterMail',
  });
}
