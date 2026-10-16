/**
 * Open a new mail in EVE: asks the Character's running EVE client to open its
 * new-mail window addressed to one character, subject and body filled in.
 * Nothing is sent; the pilot reads, edits and presses Send in game. It is a
 * UI call (`esi-ui.open_window.v1`, the Open in EVE Permission), not a mail
 * send, so it needs no mail scope and counts against no mail cap.
 */
import { isOfflineFailure, isUnconfirmedWrite } from '@/esi/client';
import { EsiError } from '@/esi/errors';
import { postOpenWindowNewMail } from '@/esi/endpoints';
import type { EsiEndpointId } from '@/esi/registry';
import { reportWriteAuthFailure } from '@/esi/writeAuthFailure';
import type { OpenInEveResult } from './sendOpenInEve';

/** Every endpoint this opens: what a grant check has to cover. */
export const OPEN_NEW_MAIL_ENDPOINTS: readonly EsiEndpointId[] = ['postOpenWindowNewMail'];

export interface NewMailDraft {
  recipientId: number;
  subject: string;
  body: string;
}

export async function openNewMail(
  characterId: number,
  draft: NewMailDraft
): Promise<OpenInEveResult> {
  try {
    await postOpenWindowNewMail(characterId, draft);
    return { ok: true };
  } catch (err) {
    if (isOfflineFailure(err)) {
      return isUnconfirmedWrite(err)
        ? { ok: false, message: null, offline: true, unconfirmed: true }
        : { ok: false, message: null, offline: true };
    }
    const outcome = await reportWriteAuthFailure(characterId, err, 'postOpenWindowNewMail');
    const message = err instanceof EsiError && err.message !== '' ? err.message : null;
    return outcome === 'grant-needed'
      ? { ok: false, message, needsPermission: true }
      : { ok: false, message };
  }
}
