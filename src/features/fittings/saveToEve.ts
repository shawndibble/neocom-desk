import { deleteCharacterFitting, postCharacterFitting } from '@/esi/endpoints';
import { EsiError, EsiTimeoutError, isOfflineFailure } from '@/esi/client';
import { reportWriteAuthFailure } from '@/esi/writeAuthFailure';
import { fittingToEsiFitting } from '@/engine/fittings/esiFittingMapper';
import type { Fitting } from '@/engine/fittings/types';

export const IN_GAME_FITTING_NAME_MAX = 50;

export function clampFittingName(name: string): string {
  return Array.from(name).slice(0, IN_GAME_FITTING_NAME_MAX).join('');
}

export const IN_GAME_FITTING_DESCRIPTION_MAX = 500;

export function clampFittingDescription(description: string): string {
  return Array.from(description).slice(0, IN_GAME_FITTING_DESCRIPTION_MAX).join('');
}

export interface SaveToEveInput {
  characterId: number;
  fitting: Fitting;
  name: string;
  description: string;
  overwriteFittingId?: number;
}

export type SaveToEveResult =
  | {
      ok: true;
      fittingId: number;
      overwriteError: string | null;
    }
  | {
      ok: false;
      kind: 'offline';
    }
  | {
      ok: false;
      kind: 'unconfirmed';
    }
  | {
      ok: false;
      kind?: 'refused';
      message: string;
      needsPermission?: true;
    };

function failedOffline(err: unknown): boolean {
  return isOfflineFailure(err) && !(err instanceof EsiTimeoutError && err.sent);
}

function messageOf(err: unknown): string {
  return err instanceof EsiError ? err.message : 'Unknown error';
}

export async function saveFittingToEve(input: SaveToEveInput): Promise<SaveToEveResult> {
  const { characterId, fitting, name, description, overwriteFittingId } = input;
  const payload = fittingToEsiFitting(
    fitting,
    clampFittingName(name),
    clampFittingDescription(description)
  );

  let fittingId: number;
  try {
    const { data } = await postCharacterFitting(characterId, payload);
    if (data === null) return { ok: false, message: 'ESI returned no fitting id' };
    fittingId = data.fitting_id;
  } catch (err) {
    if (failedOffline(err)) return { ok: false, kind: 'offline' };
    if (err instanceof EsiTimeoutError) return { ok: false, kind: 'unconfirmed' };
    const outcome = await reportWriteAuthFailure(characterId, err, 'postCharacterFitting');
    return outcome === 'grant-needed'
      ? { ok: false, message: messageOf(err), needsPermission: true }
      : { ok: false, message: messageOf(err) };
  }

  let overwriteError: string | null = null;
  if (overwriteFittingId !== undefined) {
    try {
      await deleteCharacterFitting(characterId, overwriteFittingId);
    } catch (err) {
      overwriteError = messageOf(err);
    }
  }
  return { ok: true, fittingId, overwriteError };
}
