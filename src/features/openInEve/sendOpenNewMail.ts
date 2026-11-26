import { isOfflineFailure, isUnconfirmedWrite } from '@/esi/client';
import { EsiError } from '@/esi/errors';
import { postOpenWindowNewMail } from '@/esi/endpoints';
import type { EsiEndpointId } from '@/esi/registry';
import { reportWriteAuthFailure } from '@/esi/writeAuthFailure';
import type { OpenInEveResult } from './sendOpenInEve';

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
