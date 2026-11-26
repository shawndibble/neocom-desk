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
  catalog: BlueprintCatalog | null;
  pi: PiData | null;
  ownedBlueprints: CharacterBlueprint[];
  blueprintsNeedsReauth: boolean;
  modifiers: CharacterModifiers;
  characterLoaded: boolean;
}

const SNAPSHOT_NAME = 'industryWorkspace';

export function lastWorkspaceLoad(characterId: number | null): WorkspaceLoad | null {
  return characterId === null ? null : readRouteSnapshot<WorkspaceLoad>(SNAPSHOT_NAME, characterId);
}

export function rememberWorkspaceLoad(load: WorkspaceLoad): void {
  writeRouteSnapshot(SNAPSHOT_NAME, load.characterId, load, { persist: false });
}

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

export function reuseIfUnchanged<T>(previous: T | undefined, fresh: T): T {
  return previous !== undefined && JSON.stringify(previous) === JSON.stringify(fresh)
    ? previous
    : fresh;
}
