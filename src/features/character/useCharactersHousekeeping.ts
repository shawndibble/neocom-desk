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
    if (characters && characters.length > 0) {
      void loadPublicInfoMany(characters.map((character) => character.characterId));
    }
  }, [characters, loadPublicInfoMany]);

  useEffect(() => {
    if (!characters || !groupsHydrated) return;
    const existingIds = new Set(characters.map((character) => character.characterId));
    if (groupsNeedPruning(groupsValue.groups, existingIds)) {
      void setGroupsValue(
        updateGroups(groupsValue, (groups) => pruneGroups(groups, existingIds), Date.now())
      );
    }
  }, [characters, groupsValue, groupsHydrated, setGroupsValue]);

  useEffect(() => {
    if (!characters || !starredHydrated) return;
    const existingIds = new Set(characters.map((character) => character.characterId));
    if (starredCharactersNeedPruning(starred, existingIds)) {
      void setStarred(pruneStarredCharacters(starred, existingIds));
    }
  }, [characters, starred, starredHydrated, setStarred]);
}
