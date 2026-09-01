import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CharacterRecord } from '@/db';
import {
  Button,
  CharacterAvatar,
  DataAgeBadge,
  EmptyState,
  FilterChip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  StatChip,
  type StatChipTone,
} from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { isSyncConfigured } from '@/app/syncStatus';
import { usePublicInfo, type PublicInfoEntry } from '@/stores/publicInfo';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useFontScale, FONT_SCALE_STEPS, type FontScale } from '@/lib/fontScale';
import { loadRosterSnapshot } from '@/features/character/roster';
import { deriveQueueState, type QueueState } from '@/features/skills/queueStatus';
import { removeCharacter } from '@/features/character/removeCharacter';
import { updateGroups, useOverviewGroups } from '@/features/character/overviewGroups';
import {
  addGroup,
  groupsNeedPruning,
  moveCharacterToGroup,
  pruneGroups,
  removeGroup,
  renameGroup,
  reorderGroups,
  sortCharacterIds,
  ungroupedCharacterIds,
  type CharacterGroup,
  type CharacterSortKey,
  type CharacterSortStats,
  type SortDirection,
} from '@/features/character/groups';

const UNGROUPED_VALUE = '__ungrouped__';

const QUEUE_STATE_TONE: Record<QueueState, StatChipTone> = {
  training: 'success',
  endingSoon: 'warning',
  paused: 'danger',
  idle: 'default',
  unknown: 'default',
};

const DENSITY_LABEL_KEYS = {
  0.875: 'characters.densityCompact',
  1: 'characters.densityCozy',
  1.125: 'characters.densityComfortable',
  1.25: 'characters.densitySpacious',
} as const satisfies Record<FontScale, string>;

const SORT_KEYS: readonly CharacterSortKey[] = ['name', 'skillPoints', 'wallet'];

interface QueueInfo {
  state: QueueState;
  /** When this character's cached queue was last fetched; null when never fetched. */
  fetchedAt: Date | null;
}

interface CharacterCardProps {
  character: CharacterRecord;
  info: PublicInfoEntry | undefined;
  queue: QueueInfo | undefined;
  groups: readonly CharacterGroup[];
  groupId: string | null;
  onSelect: (characterId: number) => void;
  onMoveToGroup: (characterId: number, groupId: string | null) => void;
  onRemove: (characterId: number, name: string) => void;
}

function CharacterCard({
  character,
  info,
  queue,
  groups,
  groupId,
  onSelect,
  onMoveToGroup,
  onRemove,
}: CharacterCardProps) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-2 rounded-xs border border-line bg-panel/85 p-3 backdrop-blur-sm transition-colors hover:border-line-bright hover:bg-panel-2">
      <button
        type="button"
        aria-label={t('characters.select', { name: character.name })}
        onClick={() => onSelect(character.characterId)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <CharacterAvatar
          characterId={character.characterId}
          size="lg"
          loading="lazy"
          alt={t('characters.portraitAlt', { name: character.name })}
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{character.name}</span>
          <span className="block truncate text-xs text-text-dim">
            {info?.corporationName ?? t('common.unknown')}
          </span>
          <span className="block truncate text-xs text-text-faint">
            {info?.allianceName ?? t('common.unknown')}
          </span>
          {queue && (
            <span className="mt-1 flex items-center gap-2">
              <StatChip
                label={t('characters.queueState')}
                tone={QUEUE_STATE_TONE[queue.state]}
                value={t(`characters.queueStates.${queue.state}`)}
              />
              {queue.fetchedAt && <DataAgeBadge date={queue.fetchedAt} />}
            </span>
          )}
        </span>
      </button>
      {groups.length > 0 && (
        <Select
          value={groupId ?? UNGROUPED_VALUE}
          onValueChange={(value) =>
            onMoveToGroup(character.characterId, value === UNGROUPED_VALUE ? null : value)
          }
        >
          <SelectTrigger
            aria-label={t('characters.groupFor', { name: character.name })}
            className="w-32 shrink-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNGROUPED_VALUE}>{t('characters.ungrouped')}</SelectItem>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        variant="danger"
        size="sm"
        onClick={() => onRemove(character.characterId, character.name)}
        aria-label={t('characters.removeButtonLabel', { name: character.name })}
      >
        {t('characters.remove')}
      </Button>
    </li>
  );
}

interface GroupSectionHeaderProps {
  group: CharacterGroup;
  index: number;
  groupCount: number;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}

function GroupSectionHeader({
  group,
  index,
  groupCount,
  onRename,
  onRemove,
  onMove,
}: GroupSectionHeaderProps) {
  const { t } = useTranslation();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(group.name);

  function commitRename() {
    setRenaming(false);
    const name = draftName.trim();
    if (name && name !== group.name) onRename(group.id, name);
    else setDraftName(group.name);
  }

  return (
    <div className="flex items-center gap-2">
      {renaming ? (
        <input
          autoFocus
          value={draftName}
          aria-label={t('characters.renameGroup')}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setDraftName(group.name);
              setRenaming(false);
            }
          }}
          className="h-7 flex-1 rounded-xs border border-line bg-panel-2 px-1.5 text-sm text-text"
        />
      ) : (
        <h2
          className="flex-1 truncate text-xs font-semibold tracking-widest text-text-dim uppercase"
          onDoubleClick={() => setRenaming(true)}
        >
          {group.name}
        </h2>
      )}
      <Button
        size="sm"
        onClick={() => onMove(index, -1)}
        disabled={index === 0}
        aria-label={t('characters.moveGroupUp', { name: group.name })}
      >
        ▲
      </Button>
      <Button
        size="sm"
        onClick={() => onMove(index, 1)}
        disabled={index === groupCount - 1}
        aria-label={t('characters.moveGroupDown', { name: group.name })}
      >
        ▼
      </Button>
      <Button
        size="sm"
        onClick={() => setRenaming(true)}
        aria-label={`${t('characters.renameGroup')} ${group.name}`}
      >
        {t('characters.renameGroup')}
      </Button>
      <Button
        variant="danger"
        size="sm"
        onClick={() => {
          if (window.confirm(t('characters.deleteGroupConfirm'))) onRemove(group.id);
        }}
      >
        {t('characters.deleteGroup')}
      </Button>
    </div>
  );
}

/** Character wall: pick the active character, group/sort/densify it, or add another via EVE SSO. */
export function Characters() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const characters = useLiveQuery(() => db.characters.orderBy('characterId').toArray());
  const publicInfo = usePublicInfo((state) => state.byCharacterId);
  const loadPublicInfo = usePublicInfo((state) => state.load);
  const setActiveCharacter = useActiveCharacter((state) => state.setActiveCharacter);

  const groupsValue = useOverviewGroups((state) => state.value);
  const groupsHydrated = useOverviewGroups((state) => state.hydrated);
  const hydrateGroups = useOverviewGroups((state) => state.hydrate);
  const setGroupsValue = useOverviewGroups((state) => state.setValue);

  const density = useFontScale((state) => state.value);
  const setDensity = useFontScale((state) => state.setValue);

  const [sortKey, setSortKey] = useState<CharacterSortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [stats, setStats] = useState<Map<number, CharacterSortStats>>(new Map());
  const [queueById, setQueueById] = useState<Map<number, QueueInfo>>(new Map());
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const charactersById = useMemo(
    () => new Map((characters ?? []).map((character) => [character.characterId, character])),
    [characters]
  );

  useEffect(() => {
    void hydrateGroups();
  }, [hydrateGroups]);

  useEffect(() => {
    characters?.forEach((character) => void loadPublicInfo(character.characterId));
  }, [characters, loadPublicInfo]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!characters || characters.length === 0) {
        if (!cancelled) {
          setStats(new Map());
          setQueueById(new Map());
        }
        return;
      }
      const now = Date.now();
      const roster = await loadRosterSnapshot();
      if (cancelled) return;
      setStats(
        new Map(
          roster.map((entry) => [
            entry.characterId,
            {
              name: entry.name,
              skillPoints: entry.correctedTotalSp ?? undefined,
              wallet: entry.wallet?.data,
            },
          ])
        )
      );
      setQueueById(
        new Map(
          roster.map((entry) => [
            entry.characterId,
            {
              state: deriveQueueState(entry.queue?.data, now),
              fetchedAt: entry.queue?.fetchedAt ?? null,
            },
          ])
        )
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [characters]);

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

  const groupIdByCharacterId = useMemo(() => {
    const map = new Map<number, string>();
    for (const group of groupsValue.groups) {
      for (const characterId of group.characterIds) map.set(characterId, group.id);
    }
    return map;
  }, [groupsValue.groups]);

  async function select(characterId: number) {
    await setActiveCharacter(characterId);
    navigate('/overview');
  }

  async function handleRemoveCharacter(characterId: number, name: string) {
    if (!window.confirm(t('characters.removeConfirm', { name }))) return;
    const { remotePurged } = await removeCharacter(characterId, isSyncConfigured());
    if (!remotePurged) window.alert(t('characters.removeDeferredNotice', { name }));
  }

  async function handleMoveToGroup(characterId: number, groupId: string | null) {
    await setGroupsValue(
      updateGroups(
        groupsValue,
        (groups) => moveCharacterToGroup(groups, characterId, groupId),
        Date.now()
      )
    );
  }

  async function handleCreateGroup() {
    const name = newGroupName.trim();
    setAddingGroup(false);
    setNewGroupName('');
    if (!name) return;
    const group: CharacterGroup = { id: crypto.randomUUID(), name, characterIds: [] };
    await setGroupsValue(
      updateGroups(groupsValue, (groups) => addGroup(groups, group), Date.now())
    );
  }

  async function handleRenameGroup(groupId: string, name: string) {
    await setGroupsValue(
      updateGroups(groupsValue, (groups) => renameGroup(groups, groupId, name), Date.now())
    );
  }

  async function handleRemoveGroup(groupId: string) {
    await setGroupsValue(
      updateGroups(groupsValue, (groups) => removeGroup(groups, groupId), Date.now())
    );
  }

  async function handleMoveGroup(index: number, direction: -1 | 1) {
    await setGroupsValue(
      updateGroups(
        groupsValue,
        (groups) => reorderGroups(groups, index, index + direction),
        Date.now()
      )
    );
  }

  function renderCharacterList(characterIds: readonly number[]) {
    const sortedIds = sortCharacterIds(characterIds, stats, sortKey, sortDirection);
    return (
      <ul className="grid gap-3 sm:grid-cols-2">
        {sortedIds.map((characterId) => {
          const character = charactersById.get(characterId);
          if (!character) return null;
          return (
            <CharacterCard
              key={characterId}
              character={character}
              info={publicInfo[characterId]}
              queue={queueById.get(characterId)}
              groups={groupsValue.groups}
              groupId={groupIdByCharacterId.get(characterId) ?? null}
              onSelect={(id) => void select(id)}
              onMoveToGroup={(id, groupId) => void handleMoveToGroup(id, groupId)}
              onRemove={(id, name) => void handleRemoveCharacter(id, name)}
            />
          );
        })}
      </ul>
    );
  }

  if (!characters) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  const allIds = characters.map((character) => character.characterId);
  const ungroupedIds = ungroupedCharacterIds(groupsValue.groups, allIds);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('characters.title')}</h1>
        <Button variant="primary" size="sm" onClick={() => void beginEveLogin()}>
          {t('characters.add')}
        </Button>
      </header>

      {characters.length === 0 ? (
        <EmptyState title={t('characters.emptyTitle')} hint={t('characters.emptyHint')} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={sortKey}
                onValueChange={(value) => setSortKey(value as CharacterSortKey)}
              >
                <SelectTrigger aria-label={t('characters.sortBy')} className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(`characters.sortKeys.${key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                aria-label={t('characters.sortDirection')}
                onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
              >
                {sortDirection === 'asc' ? '↑' : '↓'}
              </Button>
              {addingGroup ? (
                <input
                  autoFocus
                  value={newGroupName}
                  aria-label={t('characters.newGroupName')}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateGroup();
                    if (e.key === 'Escape') {
                      setNewGroupName('');
                      setAddingGroup(false);
                    }
                  }}
                  onBlur={() => void handleCreateGroup()}
                  className="h-7 w-40 rounded-xs border border-line bg-panel-2 px-1.5 text-sm text-text"
                />
              ) : (
                <Button size="sm" onClick={() => setAddingGroup(true)}>
                  {t('characters.newGroup')}
                </Button>
              )}
            </div>
            <div role="group" aria-label={t('characters.densityLabel')} className="flex gap-2">
              {FONT_SCALE_STEPS.map((step) => (
                <FilterChip
                  key={step}
                  label={t(DENSITY_LABEL_KEYS[step])}
                  selected={density === step}
                  onToggle={() => void setDensity(step)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {groupsValue.groups.map((group, index) => (
              <section key={group.id} className="space-y-2">
                <GroupSectionHeader
                  group={group}
                  index={index}
                  groupCount={groupsValue.groups.length}
                  onRename={(id, name) => void handleRenameGroup(id, name)}
                  onRemove={(id) => void handleRemoveGroup(id)}
                  onMove={(index2, direction) => void handleMoveGroup(index2, direction)}
                />
                {group.characterIds.length === 0 ? (
                  <p className="text-xs text-text-dim">{t('characters.emptyGroup')}</p>
                ) : (
                  renderCharacterList(group.characterIds)
                )}
              </section>
            ))}

            {(groupsValue.groups.length === 0 || ungroupedIds.length > 0) && (
              <section className="space-y-2">
                {groupsValue.groups.length > 0 && (
                  <h2 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
                    {t('characters.ungrouped')}
                  </h2>
                )}
                {renderCharacterList(ungroupedIds)}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
