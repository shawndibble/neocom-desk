import { useTranslation } from 'react-i18next';
import type { CharacterRecord } from '@/db';
import { CharacterCard } from '@/features/character/CharacterCard';
import type { AchievementLookup } from '@/features/character/useCharacterAchievements';
import { GroupSectionHeader } from '@/features/character/GroupSectionHeader';
import type { RosterCore } from '@/features/character/rosterView';
import { isCharacterStarred, partitionStarredFirst } from '@/features/character/starredCharacters';
import {
  sortCharacterIds,
  type CharacterGroup,
  type CharacterSortKey,
  type CharacterSortStats,
  type SortDirection,
} from '@/features/character/groups';

/**
 * Card view — one section per group plus Ungrouped. Group sectioning is
 * card-view-only (decision 20260927-071415); the table is one flat list.
 */
export function CharactersCardView({
  groups,
  ungroupedIds,
  charactersById,
  rosterCore,
  alertCounts,
  groupIdByCharacterId,
  starred,
  activeCharacterId,
  sortKey,
  sortDirection,
  sortStatsById,
  matchesFilters,
  notTrainingAlertEnabledFor,
  onSelect,
  onToggleStar,
  onMoveToGroup,
  onRemove,
  achievements,
  onRenameGroup,
  onRemoveGroup,
  onMoveGroup,
}: {
  groups: readonly CharacterGroup[];
  ungroupedIds: readonly number[];
  charactersById: ReadonlyMap<number, CharacterRecord>;
  rosterCore: ReadonlyMap<number, RosterCore>;
  alertCounts: ReadonlyMap<number, number>;
  groupIdByCharacterId: ReadonlyMap<number, string>;
  starred: readonly number[];
  activeCharacterId: number | null;
  sortKey: CharacterSortKey;
  sortDirection: SortDirection;
  sortStatsById: ReadonlyMap<number, CharacterSortStats>;
  matchesFilters: (characterId: number) => boolean;
  notTrainingAlertEnabledFor: (characterId: number) => boolean;
  onSelect: (characterId: number) => void;
  onToggleStar: (characterId: number) => void;
  onMoveToGroup: (characterId: number, groupId: string | null) => void;
  onRemove: (characterId: number, name: string) => void;
  achievements: AchievementLookup;
  onRenameGroup: (groupId: string, name: string) => void;
  onRemoveGroup: (groupId: string) => void;
  onMoveGroup: (index: number, direction: -1 | 1) => void;
}) {
  const { t } = useTranslation();

  function renderCardList(characterIds: readonly number[]) {
    // A group (or the ungrouped section) that the filter emptied just shows
    // nothing here — repeating a "no matches" line under every such section
    // would be noise once any other section still has results. The one case
    // worth telling the user about, the whole roster coming up empty, is
    // handled once, above every section, by the caller.
    const filteredIds = characterIds.filter((characterId) => matchesFilters(characterId));
    if (filteredIds.length === 0) return null;

    // Starred first, then the chosen sort key — a layer on top of the sort,
    // not a replacement for it, so a star raises one card and leaves the order
    // of everything around it exactly as the user asked for.
    const sortedIds = partitionStarredFirst(
      sortCharacterIds(filteredIds, sortStatsById, sortKey, sortDirection),
      starred
    );

    return (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sortedIds.map((characterId) => {
          const character = charactersById.get(characterId);
          if (!character) return null;
          return (
            <CharacterCard
              key={characterId}
              character={character}
              stats={rosterCore.get(characterId)?.stats}
              queue={rosterCore.get(characterId)?.queue}
              notTrainingAlertEnabled={notTrainingAlertEnabledFor(characterId)}
              groups={groups}
              groupId={groupIdByCharacterId.get(characterId) ?? null}
              starred={isCharacterStarred(starred, characterId)}
              isActive={activeCharacterId === characterId}
              alertCount={alertCounts.get(characterId) ?? 0}
              onSelect={onSelect}
              onToggleStar={onToggleStar}
              onMoveToGroup={onMoveToGroup}
              onRemove={onRemove}
              achievement={achievements.partsOf(characterId)}
            />
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group, index) => (
        <section key={group.id} className="space-y-2">
          <GroupSectionHeader
            group={group}
            index={index}
            groupCount={groups.length}
            onRename={onRenameGroup}
            onRemove={onRemoveGroup}
            onMove={onMoveGroup}
          />
          {group.characterIds.length === 0 ? (
            <p className="text-xs text-text-dim">{t('characters.emptyGroup')}</p>
          ) : (
            renderCardList(group.characterIds)
          )}
        </section>
      ))}

      {(groups.length === 0 || ungroupedIds.length > 0) && (
        <section className="space-y-2">
          {groups.length > 0 && (
            <h2
              data-ungrouped-heading
              className="text-xs font-semibold tracking-widest text-text-dim uppercase focus:outline-none"
            >
              {t('characters.ungrouped')}
            </h2>
          )}
          {renderCardList(ungroupedIds)}
        </section>
      )}
    </div>
  );
}
