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
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { PiData } from '@/sde/types';
import { readRouteSnapshot, writeRouteSnapshot } from '@/lib/routeSnapshotCache';
import type { BlueprintCatalog } from './blueprintCatalog';

export interface WorkspaceLoad {
  characterId: number;
  catalog: BlueprintCatalog;
  pi: PiData | null;
  ownedBlueprints: CharacterBlueprint[];
  blueprintsNeedsReauth: boolean;
  modifiers: CharacterModifiers;
}

const SNAPSHOT_NAME = 'industryWorkspace';

/** The last load for `characterId`, or null when there is none for that Character. */
export function lastWorkspaceLoad(characterId: number | null): WorkspaceLoad | null {
  return characterId === null ? null : readRouteSnapshot<WorkspaceLoad>(SNAPSHOT_NAME, characterId);
}

export function rememberWorkspaceLoad(load: WorkspaceLoad): void {
  writeRouteSnapshot(SNAPSHOT_NAME, load.characterId, load);
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
