import { beforeEach, describe, expect, it } from 'vitest';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { BlueprintCatalog } from './blueprintCatalog';
import { forgetRouteSnapshots, resetRouteSnapshots } from '@/lib/routeSnapshotCache';
import {
  lastWorkspaceLoad,
  rememberWorkspaceLoad,
  reuseIfUnchanged,
  type WorkspaceLoad,
} from './workspaceLoadCache';

const load = (characterId: number): WorkspaceLoad => ({
  characterId,
  catalog: { byBlueprintTypeID: new Map() } as unknown as BlueprintCatalog,
  pi: null,
  ownedBlueprints: [],
  blueprintsNeedsReauth: false,
  modifiers: { skills: {} } as unknown as CharacterModifiers,
});

beforeEach(() => resetRouteSnapshots());

describe('lastWorkspaceLoad', () => {
  it('is null before anything loads', () => {
    expect(lastWorkspaceLoad(1)).toBeNull();
  });

  it('hands back the last load for the same Character', () => {
    const loaded = load(1);
    rememberWorkspaceLoad(loaded);
    expect(lastWorkspaceLoad(1)).toBe(loaded);
  });

  it('never hands one Character’s load to another', () => {
    rememberWorkspaceLoad(load(1));
    expect(lastWorkspaceLoad(2)).toBeNull();
  });

  it('is forgotten with the Character’s cache', () => {
    rememberWorkspaceLoad(load(1));
    forgetRouteSnapshots(1);
    expect(lastWorkspaceLoad(1)).toBeNull();
  });

  it('is null with no active Character', () => {
    rememberWorkspaceLoad(load(1));
    expect(lastWorkspaceLoad(null)).toBeNull();
  });
});

describe('reuseIfUnchanged', () => {
  it('keeps the previous value when the fresh one holds the same data', () => {
    const previous = [{ type_id: 1, runs: -1 }];
    expect(reuseIfUnchanged(previous, [{ type_id: 1, runs: -1 }])).toBe(previous);
  });

  it('takes the fresh value when the data changed', () => {
    const fresh = [{ type_id: 2, runs: -1 }];
    expect(reuseIfUnchanged([{ type_id: 1, runs: -1 }], fresh)).toBe(fresh);
  });

  it('takes the fresh value when there was none before', () => {
    const fresh = { skills: {} };
    expect(reuseIfUnchanged(undefined, fresh)).toBe(fresh);
  });
});
