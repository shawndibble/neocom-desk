/**
 * The pure "text -> Fitting" step of a Load: EFT paste, a DNA/in-game chat
 * link, or a killmail link. Shared by `useFittingWorkspace`'s paste box and
 * the compare page's "Compare with... > Load" tab — neither owns the other's
 * state, so this returns a result instead of committing anywhere.
 */
import { getKillmail } from '@/esi/endpoints';
import { fetchKillmailHash } from '@/lib/zkillboard';
import {
  loadEftFitting,
  eftResultToFitting,
  type EftLoadResult,
  type EftSlotLookup,
  type EftUnresolvedItem,
} from '@/engine/fittings/eftLoader';
import {
  classifyLoadInput,
  killmailVictimToLoadResult,
  loadDnaFitting,
} from '@/engine/fittings/linkLoader';
import type { Fitting } from '@/engine/fittings/types';
import { loadItemNameMap } from '@/features/skills/typeCatalog';
import { loadFittingSlots, typeName } from '@/sde/loadSde';

/** Why a Load produced no Fitting, beyond the per-line `unresolved` list. */
export type LoadError = 'unrecognised' | 'killmail-not-found' | 'killmail-failed';

export interface LoadFromTextResult {
  ok: boolean;
  fitting: Fitting | null;
  unresolved: EftUnresolvedItem[];
  error: LoadError | null;
  /** Set when the text was itself a Share Link — the caller should open this code directly rather than read `fitting`, so the original code round-trips unchanged instead of being re-encoded. */
  shareCode: string | null;
}

/** Fetches a killmail's victim and reads its fit; the hash is looked up when the link had none. */
async function loadKillmailFitting(
  killmailId: number,
  hash: string | undefined,
  slotByTypeId: EftSlotLookup
): Promise<EftLoadResult | LoadError> {
  const resolvedHash = hash ?? (await fetchKillmailHash(killmailId));
  if (resolvedHash === null) return 'killmail-not-found';
  try {
    const { data } = await getKillmail(killmailId, resolvedHash);
    return data === null
      ? 'killmail-failed'
      : killmailVictimToLoadResult(data.victim, slotByTypeId);
  } catch {
    return 'killmail-failed';
  }
}

/** Loads EFT text, a DNA string / chat link, a Share Link, an eveship.fit link, or a killmail link. */
export async function loadFittingFromText(text: string): Promise<LoadFromTextResult> {
  const input = classifyLoadInput(text);
  if (input.kind === 'unknown') {
    return { ok: false, fitting: null, unresolved: [], error: 'unrecognised', shareCode: null };
  }
  if (input.kind === 'share') {
    return { ok: true, fitting: null, unresolved: [], error: null, shareCode: input.code };
  }
  const [typeByName, slotByTypeId] = await Promise.all([loadItemNameMap(), loadFittingSlots()]);
  let result: EftLoadResult;
  if (input.kind === 'eft') {
    result = loadEftFitting(input.text, typeByName, slotByTypeId);
  } else if (input.kind === 'dna') {
    result = loadDnaFitting(input.dna, slotByTypeId);
  } else {
    const loaded = await loadKillmailFitting(input.killmailId, input.hash, slotByTypeId);
    if (typeof loaded === 'string') {
      return { ok: false, fitting: null, unresolved: [], error: loaded, shareCode: null };
    }
    result = loaded;
  }
  if (result.hullTypeId === null) {
    return {
      ok: false,
      fitting: null,
      unresolved: result.unresolved,
      error: null,
      shareCode: null,
    };
  }
  const name = await typeName(result.hullTypeId);
  return {
    ok: true,
    fitting: eftResultToFitting(result, name),
    unresolved: result.unresolved,
    error: null,
    shareCode: null,
  };
}
