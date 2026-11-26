import { characterGet } from './characterRequest';
import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import type { EndpointOptions } from './options';

export interface MailRecipient {
  recipient_id: number;
  recipient_type: 'alliance' | 'character' | 'corporation' | 'mailing_list';
}

export interface MailHeader {
  mail_id: number;
  from?: number;
  subject?: string;
  timestamp?: string;
  is_read?: boolean;
  labels?: number[];
  recipients?: MailRecipient[];
}

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

export interface MailSendBody {
  recipients: MailRecipient[];
  subject: string;
  body: string;
  approved_cost?: number;
}

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
