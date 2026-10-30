/**
 * The last thing `useIndustryWorkspace` loaded, kept across its mounts.
 *
 * Each Industry page (`/industry`, `/industry/plans/:id`, `/industry/groups/:id`)
 * calls the hook on its own, so opening a plan from the index used to start
 * from nothing and show a spinner until the catalog, the Character's
 * blueprints and its skills/implants had all loaded again — the ESI-backed
 * ones waiting out a revalidation whenever their cache row was past its
 * window. A page mounting for the same Character now starts from what the
 * last one had and refreshes behind it.
 *
 * Kept in `lib/routeSnapshotCache.ts`, so a Character's load is forgotten
 * with the rest of its cache (removal, sign-out) and reset between tests.
 */
import type { CharacterBlueprint } from '@/esi/endpoints';
import {
  NO_CHARACTER_MODIFIERS,
  type CharacterModifiers,
} from '@/engine/industry/characterModifiers';
import type { PiData } from '@/sde/types';
import { readRouteSnapshot, writeRouteSnapshot } from '@/lib/routeSnapshotCache';
import type { BlueprintCatalog } from './blueprintCatalog';

export interface WorkspaceLoad {
  characterId: number;
  /** Null until the blueprint catalog has loaded: it is loaded apart from the Character's own data. */
  catalog: BlueprintCatalog | null;
  pi: PiData | null;
  ownedBlueprints: CharacterBlueprint[];
  blueprintsNeedsReauth: boolean;
  modifiers: CharacterModifiers;
  /**
   * The Character's own reads (blueprints, skills) have settled. A load without
   * it is the catalog alone: pages must not price from it, or they would price
   * with no skills and then jump.
   */
  characterLoaded: boolean;
}

const SNAPSHOT_NAME = 'industryWorkspace';

/** The last load for `characterId`, or null when there is none for that Character. */
export function lastWorkspaceLoad(characterId: number | null): WorkspaceLoad | null {
  return characterId === null ? null : readRouteSnapshot<WorkspaceLoad>(SNAPSHOT_NAME, characterId);
}

export function rememberWorkspaceLoad(load: WorkspaceLoad): void {
  // Memory only: the catalog carries the whole SDE type and blueprint maps
  // (megabytes), and every patch is a new object, so storing it would clone
  // all of it on each Industry load.
  writeRouteSnapshot(SNAPSHOT_NAME, load.characterId, load, { persist: false });
}

/**
 * Merges `patch` into the last load for `characterId` (or an empty one), so the
 * catalog and the Character's own data — which load, and fail, independently —
 * each record what they got without waiting for the other.
 */
export function patchWorkspaceLoad(
  characterId: number,
  patch: Partial<Omit<WorkspaceLoad, 'characterId'>>
): WorkspaceLoad {
  const load: WorkspaceLoad = {
    ...(lastWorkspaceLoad(characterId) ?? {
      characterId,
      catalog: null,
      pi: null,
      ownedBlueprints: [],
      blueprintsNeedsReauth: false,
      modifiers: NO_CHARACTER_MODIFIERS,
      characterLoaded: false,
    }),
    ...patch,
  };
  rememberWorkspaceLoad(load);
  return load;
}

/**
 * `previous` when `fresh` holds the same data, else `fresh`. A refresh that
 * changed nothing then keeps its identity, so it doesn't re-price an open
 * plan that is already showing exactly this.
 */
export function reuseIfUnchanged<T>(previous: T | undefined, fresh: T): T {
  return previous !== undefined && JSON.stringify(previous) === JSON.stringify(fresh)
    ? previous
    : fresh;
}
