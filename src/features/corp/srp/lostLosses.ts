/**
 * The pilot's own losses for the SRP page (issue #4852): `/characters/{id}/killmails/recent`
 * lists kills and losses alike as bare id + hash, so each is read from the public killmail
 * endpoint and kept only if this Character died in this corporation (the server refuses the
 * rest). Killmails never change, so a read is kept for the session.
 */
import { loadWithCache } from '@/esi/cache';
import { isCredentialFailure } from '@/esi/client';
import {
  getCharacterKillmailsRecent,
  getKillmail,
  type CharacterKillmailRef,
  type Killmail,
} from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadTypes } from '@/sde/loadSde';
import type { LostLoss } from './srpMemberModel';

/** ESI serves 50 a page; this bounds the detail reads one visit costs, newest first. */
const MAX_PAGES = 3;
const REFS_KEY = 'killmailsRecent';

export interface CollectLossesInput {
  refs: readonly CharacterKillmailRef[];
  readKillmail: (id: number, hash: string) => Promise<Killmail | null>;
  characterId: number;
  corporationId: number;
  groupOf: (typeId: number) => number;
}

/** The refs that are this Character's losses in this corporation, newest first. */
export async function collectLosses(input: CollectLossesInput): Promise<LostLoss[]> {
  const found: LostLoss[] = [];
  await mapWithConcurrencyLimit(input.refs, ESI_FANOUT_CONCURRENCY, async (ref) => {
    let km: Killmail | null;
    try {
      km = await input.readKillmail(ref.killmail_id, ref.killmail_hash);
    } catch {
      return; // one unreadable killmail must not hide the rest
    }
    const { victim } = km ?? {};
    if (!km || !victim) return;
    if (victim.character_id !== input.characterId) return;
    if (victim.corporation_id !== input.corporationId) return;
    const killedAt = km.killmail_time ? Date.parse(km.killmail_time) : NaN;
    if (Number.isNaN(killedAt) || km.solar_system_id === undefined) return;
    found.push({
      killmailId: ref.killmail_id,
      killmailHash: ref.killmail_hash,
      hullTypeId: victim.ship_type_id,
      classId: input.groupOf(victim.ship_type_id),
      solarSystemId: km.solar_system_id,
      killedAt,
    });
  });
  return found.sort((a, b) => b.killedAt - a.killedAt);
}

const killmailReads = new Map<number, Promise<Killmail | null>>();

function readKillmailOnce(id: number, hash: string): Promise<Killmail | null> {
  let read = killmailReads.get(id);
  if (!read) {
    read = getKillmail(id, hash).then((r) => r.data);
    // A failed read is retried on the next visit rather than remembered.
    read.catch(() => killmailReads.delete(id));
    killmailReads.set(id, read);
  }
  return read;
}

/**
 * The Character's losses in `corporationId`. Needs the opt-in `killmails` Permission: ESI answers a
 * 403 without it, which the caller avoids by asking `useEndpointsGranted` first.
 */
export async function loadLostLosses(
  characterId: number,
  corporationId: number
): Promise<LostLoss[]> {
  const cached = await loadWithCache(
    characterId,
    REFS_KEY,
    async () => (await getCharacterKillmailsRecent(characterId, { maxPages: MAX_PAGES })).items,
    { detectAuthFailure: isCredentialFailure }
  );
  const types = await loadTypes();
  return collectLosses({
    refs: cached?.data ?? [],
    readKillmail: readKillmailOnce,
    characterId,
    corporationId,
    groupOf: (typeId) => types[String(typeId)]?.groupID ?? 0,
  });
}
