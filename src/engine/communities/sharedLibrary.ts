import { DAY_MS } from '@/lib/age';
import { sharesBlueprint, type BlueprintShare } from './shareMode';

export interface SharedBlueprint {
  typeId: number;
  me: number;
  te: number;
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

export const LIBRARY_CHUNK_SIZE = 500;
export const LIBRARY_MAX_CHUNKS = 200;

export const LIBRARY_STALE_MS = 30 * DAY_MS;

export const LIBRARY_STAMP_REFRESH_MS = 7 * DAY_MS;

export interface ResolvedPlace {
  locationName: string;
  systemName: string;
}

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

export function isLibraryStale(pushedAt: number | null, now: number): boolean {
  return pushedAt !== null && now - pushedAt > LIBRARY_STALE_MS;
}

export type PushPlan = 'full' | 'stamp' | 'skip';

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
