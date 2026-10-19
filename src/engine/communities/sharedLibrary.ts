/**
 * A Member's Shared Blueprint library for one Community (issue #3600, ADR
 * 0018): which of a Character's owned blueprints to publish, the hash the
 * device compares to skip an unchanged push, the chunking Firestore needs,
 * and when a published library reads as stale. Pure: the push itself is
 * `features/communities/libraryPush.ts`.
 */
import { sharesBlueprint, type BlueprintShare } from './shareMode';

/** What a Member shares of one blueprint. Never a container, hangar or item id. */
export interface SharedBlueprint {
  typeId: number;
  me: number;
  te: number;
  /** -1 for a BPO, else the BPC's runs left. */
  runs: number;
  locationName: string;
  systemName: string;
}

export interface OwnedBlueprintInput {
  type_id: number;
  material_efficiency: number;
  time_efficiency: number;
  runs: number;
}

/** firestore.rules caps a chunk doc at 500 items and a library at 200 chunks. */
export const LIBRARY_CHUNK_SIZE = 500;
export const LIBRARY_MAX_CHUNKS = 200;

/** A library not refreshed for this long reads as stale: greyed and badged, never hidden. */
export const LIBRARY_STALE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * An unchanged list is not rewritten, but its stamp is renewed after this
 * long so a Member who plays daily never reads stale. One tiny write a week.
 */
export const LIBRARY_STAMP_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResolvedPlace {
  locationName: string;
  systemName: string;
}

/**
 * The blueprints to publish: the copies the share covers (`sharesBlueprint`:
 * by type, or by their station or structure under a location rule) whose
 * station or structure and system are known. `placeIdOf` is a copy's resolved
 * station or structure id, null in a container with no resolvable station;
 * `placeOf` names a place, null for an unresolvable structure. Such a copy is
 * left out rather than shared with a guessed place, and counted in `skipped`
 * so the Member can be told how many. Place ids are only matched here, never
 * published.
 */
export function splitSharedBlueprints<B extends OwnedBlueprintInput>(
  owned: readonly B[],
  share: BlueprintShare,
  placeIdOf: (blueprint: B) => number | null,
  placeOf: (placeId: number) => ResolvedPlace | null
): { shared: SharedBlueprint[]; skipped: number } {
  const shared: SharedBlueprint[] = [];
  let skipped = 0;
  for (const blueprint of owned) {
    const placeId = placeIdOf(blueprint);
    if (!sharesBlueprint(share, blueprint.type_id, placeId)) continue;
    const place = placeId === null ? null : placeOf(placeId);
    if (!place) {
      skipped += 1;
      continue;
    }
    shared.push({
      typeId: blueprint.type_id,
      me: blueprint.material_efficiency,
      te: blueprint.time_efficiency,
      runs: blueprint.runs,
      locationName: place.locationName,
      systemName: place.systemName,
    });
  }
  return { shared: shared.sort(compareShared), skipped };
}

function compareShared(a: SharedBlueprint, b: SharedBlueprint): number {
  return (
    a.typeId - b.typeId ||
    a.runs - b.runs ||
    a.me - b.me ||
    a.te - b.te ||
    a.locationName.localeCompare(b.locationName) ||
    a.systemName.localeCompare(b.systemName)
  );
}

/** cyrb53 over the canonical JSON: 14 hex characters, no crypto API needed. */
export function libraryHash(items: readonly SharedBlueprint[]): string {
  const text = JSON.stringify(
    items.map((i) => [i.typeId, i.me, i.te, i.runs, i.locationName, i.systemName])
  );
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}

export function chunkLibrary(items: readonly SharedBlueprint[]): SharedBlueprint[][] {
  const chunks: SharedBlueprint[][] = [];
  for (let i = 0; i < items.length; i += LIBRARY_CHUNK_SIZE) {
    chunks.push(items.slice(i, i + LIBRARY_CHUNK_SIZE));
  }
  return chunks;
}

/** A Member that never published has no stamp and is not stale: it shares nothing. */
export function isLibraryStale(pushedAt: number | null, now: number): boolean {
  return pushedAt !== null && now - pushedAt > LIBRARY_STALE_MS;
}

export type PushPlan = 'full' | 'stamp' | 'skip';

/**
 * What the device does for one Community: rewrite the library when its hash
 * differs from the last push, renew only the stamp when the list is unchanged
 * but the stamp is getting old, else nothing. `last` is what the Member doc
 * holds (null when nothing was ever published).
 */
export function planPush(
  last: { hash: string; pushedAt: number } | null,
  hash: string,
  count: number,
  now: number
): PushPlan {
  if (!last) return count === 0 ? 'skip' : 'full';
  if (last.hash !== hash) return 'full';
  return now - last.pushedAt > LIBRARY_STAMP_REFRESH_MS ? 'stamp' : 'skip';
}
