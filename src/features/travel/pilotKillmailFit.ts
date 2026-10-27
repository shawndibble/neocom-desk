/**
 * Travel › Pilot Lookup's recent kills and losses (issue #2332): the victim's
 * fit behind one row, read only when the row is expanded. zKillboard's inline
 * body carries the victim already; its hash-only shape is read from ESI's
 * killmail endpoint with the hash zKillboard supplied.
 */
import { killmailVictimToLoadResult } from '@/engine/fittings/linkLoader';
import { toLoadOutcome } from '@/engine/fittings/load';
import type { Fitting } from '@/engine/fittings/types';
import { getKillmail } from '@/esi/endpoints';
import { readKillmailDetail, type KillmailDetail, type PilotKillmail } from '@/lib/zkillboard';
import { loadFittingSlots, typeName } from '@/sde/loadSde';

/** `fitting` is null when the hull isn't one a Fitting can hold. `ok: false` when ESI couldn't supply the killmail. */
export type KillmailFitResult =
  { ok: true; detail: KillmailDetail; fitting: Fitting | null } | { ok: false };

async function resolveDetail(entry: PilotKillmail): Promise<KillmailDetail | null> {
  if (entry.detail !== null) return entry.detail;
  try {
    return readKillmailDetail((await getKillmail(entry.killmailId, entry.hash)).data);
  } catch {
    return null;
  }
}

/** The row's killmail and its victim's fit, named after the hull. Never throws. */
export async function loadKillmailFit(entry: PilotKillmail): Promise<KillmailFitResult> {
  const detail = await resolveDetail(entry);
  if (detail === null) return { ok: false };
  try {
    const parts = killmailVictimToLoadResult(detail.victim, await loadFittingSlots());
    const outcome = toLoadOutcome(parts, await typeName(detail.victim.ship_type_id), 'text');
    return { ok: true, detail, fitting: outcome.kind === 'fitting' ? outcome.fitting : null };
  } catch {
    return { ok: false };
  }
}
