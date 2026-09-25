/**
 * Save to EVE (issue #1540): exports the open Fitting as an In-game Fitting.
 * ESI has no edit — overwriting an existing In-game Fitting is a delete plus
 * a create, and the create runs *first*. That ordering is what keeps the
 * acceptance criterion "a failed recreate never leaves the pilot without
 * their original": a failed create leaves the old In-game Fitting untouched,
 * and a failed delete after a successful create leaves the pilot with both
 * rather than neither.
 */
import { deleteCharacterFitting, postCharacterFitting } from '@/esi/endpoints';
import { EsiError } from '@/esi/client';
import { fittingToEsiFitting } from '@/engine/fittings/esiFittingMapper';
import type { Fitting } from '@/engine/fittings/types';

/** ESI's own limit on an In-game Fitting's name. */
export const IN_GAME_FITTING_NAME_MAX = 50;

/**
 * Clamps to `IN_GAME_FITTING_NAME_MAX` on Unicode code points, not UTF-16
 * code units — a plain `.slice` can fall inside a surrogate pair (an emoji,
 * say) and corrupt the trailing half.
 */
export function clampFittingName(name: string): string {
  return Array.from(name).slice(0, IN_GAME_FITTING_NAME_MAX).join('');
}

export interface SaveToEveInput {
  characterId: number;
  fitting: Fitting;
  name: string;
  description: string;
  /** Set to overwrite: that In-game Fitting is deleted once the replacement save succeeds. */
  overwriteFittingId?: number;
}

export type SaveToEveResult =
  | {
      ok: true;
      fittingId: number;
      /** Set when overwriting and the old Fitting's delete failed — the pilot now has both. Null otherwise. */
      overwriteError: string | null;
    }
  | { ok: false; message: string };

function messageOf(err: unknown): string {
  return err instanceof EsiError ? err.message : 'Unknown error';
}

export async function saveFittingToEve(input: SaveToEveInput): Promise<SaveToEveResult> {
  const { characterId, fitting, name, description, overwriteFittingId } = input;
  const payload = fittingToEsiFitting(fitting, clampFittingName(name), description);

  let fittingId: number;
  try {
    const { data } = await postCharacterFitting(characterId, payload);
    if (data === null) return { ok: false, message: 'ESI returned no fitting id' };
    fittingId = data.fitting_id;
  } catch (err) {
    return { ok: false, message: messageOf(err) };
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
