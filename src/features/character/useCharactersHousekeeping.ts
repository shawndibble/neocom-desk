import { useEffect } from 'react';
import { usePublicInfo } from '@/stores/publicInfo';
import {
  migrateVisibleColumns,
  type CharacterColumnId,
} from '@/features/character/characterColumns';
import { updateGroups, type OverviewGroupsValue } from '@/features/character/overviewGroups';
import { groupsNeedPruning, pruneGroups } from '@/features/character/groups';
import {
  pruneStarredCharacters,
  starredCharactersNeedPruning,
} from '@/features/character/starredCharacters';

interface HousekeepingInput {
  characters: readonly { characterId: number }[] | undefined;
  groupsValue: OverviewGroupsValue;
  groupsHydrated: boolean;
  setGroupsValue: (next: OverviewGroupsValue) => Promise<void>;
  starred: readonly number[];
  starredHydrated: boolean;
  setStarred: (next: number[]) => Promise<void>;
  visibleColumns: readonly CharacterColumnId[];
  visibleColumnsHydrated: boolean;
  setVisibleColumns: (next: readonly CharacterColumnId[]) => Promise<void>;
  columnsMigrated: boolean;
  columnsMigratedHydrated: boolean;
  setColumnsMigrated: (next: boolean) => Promise<void>;
}

/**
 * The Characters page's background upkeep, none of it user-driven: batch-load
 * public info, run the one-shot column migration, and drop group/star entries
 * for Characters no longer on this device.
 */
export function useCharactersHousekeeping({
  characters,
  groupsValue,
  groupsHydrated,
  setGroupsValue,
  starred,
  starredHydrated,
  setStarred,
  visibleColumns,
  visibleColumnsHydrated,
  setVisibleColumns,
  columnsMigrated,
  columnsMigratedHydrated,
  setColumnsMigrated,
}: HousekeepingInput) {
  const loadPublicInfoMany = usePublicInfo((state) => state.loadMany);

  // One-shot migration (issue #2077, decision 20260927-071415): a stored
  // column list from before `group`/`remove` existed is missing both, not
  // because a pilot hid them. Gated on `columnsMigrated` rather than run on
  // every hydrate, so a pilot who deliberately hides one afterward keeps it
  // hidden. `setColumnsMigrated(true)` fires even when nothing was actually
  // missing, so this never runs a second time on this device.
  useEffect(() => {
    if (!visibleColumnsHydrated || !columnsMigratedHydrated || columnsMigrated) return;
    const migrated = migrateVisibleColumns(visibleColumns);
    void (async () => {
      if (migrated !== visibleColumns) await setVisibleColumns(migrated);
      await setColumnsMigrated(true);
    })();
  }, [
    visibleColumnsHydrated,
    columnsMigratedHydrated,
    columnsMigrated,
    visibleColumns,
    setVisibleColumns,
    setColumnsMigrated,
  ]);

  useEffect(() => {
    // One batched call for the whole roster (issue: /characters page N+1 ESI
    // calls) rather than one `load` per character — see `loadMany`'s doc
    // comment on `usePublicInfo`.
    if (characters && characters.length > 0) {
      void loadPublicInfoMany(characters.map((character) => character.characterId));
    }
  }, [characters, loadPublicInfoMany]);

  // Self-heals dangling group entries: a character removed from this device
  // disappears from its group instead of lingering as a stale id.
  useEffect(() => {
    if (!characters || !groupsHydrated) return;
    const existingIds = new Set(characters.map((character) => character.characterId));
    if (groupsNeedPruning(groupsValue.groups, existingIds)) {
      void setGroupsValue(
        updateGroups(groupsValue, (groups) => pruneGroups(groups, existingIds), Date.now())
      );
    }
  }, [characters, groupsValue, groupsHydrated, setGroupsValue]);

  // Same self-heal for stars, and for the same reason — but note this lives
  // on the roster rather than in the remove-confirm handler: a Character can
  // also leave this device without passing through that button (a sold
  // Character, dropped by `handleOwnerHashChange` — see removeCharacter.ts's
  // header). Reconciling against the roster catches every route out; a hook on
  // the confirm handler would catch one of them.
  useEffect(() => {
    if (!characters || !starredHydrated) return;
    const existingIds = new Set(characters.map((character) => character.characterId));
    if (starredCharactersNeedPruning(starred, existingIds)) {
      void setStarred(pruneStarredCharacters(starred, existingIds));
    }
  }, [characters, starred, starredHydrated, setStarred]);
}
