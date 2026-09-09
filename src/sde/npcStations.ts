/**
 * `public/data/market/stations.json` read as a lookup rather than a list.
 *
 * That file is the whole `staStations` table — every NPC station in the game,
 * static between expansions — which makes it two things at once (issue #655):
 *
 *  - the answer to "what is this station called, where is it, what type is
 *    it", with no `GET /universe/stations/{id}` behind it; and
 *  - the answer to "is this location id an NPC station at all". Membership is
 *    a *decision*, not a cache hit: an id the snapshot does not hold is a
 *    player structure, so a contract location can go straight to
 *    `/universe/structures/{id}` instead of first spending the 404 that
 *    `contractLocationName.ts` used to pay on every open. A 404 is a non-2xx
 *    and counts against ESI's 100-errors-per-minute budget like any other.
 *
 * That second use is why `lookupNpcStation` answers with three values rather
 * than two. "Loaded, and this id is not in it" and "could not read the
 * snapshot at all" are opposite conclusions, and collapsing them would send
 * every NPC station to the structure endpoint on a first offline visit — the
 * file sits outside the install precache on purpose (CONTEXT.md round 10: most
 * installs never open /market and should not pay ~1.2 MB up front), so failing
 * to read it is an ordinary outcome rather than a bug.
 *
 * Indexed once per session. The list is ~5,200 entries and the character
 * surfaces ask per id — Assets resolves every distinct station in an asset
 * list — so scanning it per id would be O(ids × 5,200) on every page, which is
 * not the "synchronous map lookup" the fan-outs there are supposed to become.
 */
import { loadNpcStations } from './loadMarketSde';
import type { NpcStationEntry } from './marketTypes';

let index: Promise<ReadonlyMap<number, NpcStationEntry> | null> | null = null;

/**
 * The snapshot keyed by station id, or `null` when it could not be read.
 * Memoized per session; a failure is not memoized, so a later visit that can
 * reach the file still gets it (same trade as `loadMarketSde`'s own `cached`).
 */
export function loadNpcStationsById(): Promise<ReadonlyMap<number, NpcStationEntry> | null> {
  index ??= loadNpcStations()
    .then((entries): ReadonlyMap<number, NpcStationEntry> => {
      const map = new Map<number, NpcStationEntry>();
      for (const entry of entries) map.set(entry.id, entry);
      return map;
    })
    .catch(() => {
      index = null;
      return null;
    });
  return index;
}

/**
 * What the snapshot says about one location id:
 *
 * - an entry — an NPC station: name, system and type with no request at all.
 * - `null` — the snapshot loaded and does not hold this id, so it is a player
 *   structure. Definitive, and the discriminator mixed-id callers branch on.
 * - `undefined` — the snapshot itself could not be read, so nothing can be
 *   concluded and the caller falls back to whatever it did before it existed.
 */
export async function lookupNpcStation(
  stationId: number
): Promise<NpcStationEntry | null | undefined> {
  const byId = await loadNpcStationsById();
  if (!byId) return undefined;
  return byId.get(stationId) ?? null;
}

/**
 * Drops the memoized index. For tests, which swap the snapshot between cases;
 * nothing in the app has a reason to call it, since the underlying file cannot
 * change inside a session.
 */
export function clearNpcStationIndex(): void {
  index = null;
}
