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
  IconButton,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  StatChip,
  TextInput,
  type StatChipTone,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginAddCharacterLogin } from '@/app/loginFlow';
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
  rosterSortStats,
  sortCharacterIds,
  ungroupedCharacterIds,
  type CharacterGroup,
  type CharacterSortKey,
  type CharacterSortStats,
  type SortDirection,
} from '@/features/character/groups';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatIskCompact } from '@/lib/isk';

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
  stats: CharacterSortStats | undefined;
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
  stats,
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
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <StatChip
              label={t('characters.spLabel')}
              value={
                stats?.skillPoints === undefined
                  ? t('common.unknown')
                  : formatCompactNumber(stats.skillPoints)
              }
            />
            {stats?.skillPointsFetchedAt && <DataAgeBadge date={stats.skillPointsFetchedAt} />}
            <StatChip
              label={t('characters.walletLabel')}
              value={
                stats?.wallet === undefined ? t('common.unknown') : formatIskCompact(stats.wallet)
              }
            />
            {stats?.walletFetchedAt && <DataAgeBadge date={stats.walletFetchedAt} />}
            {queue && (
              <>
                <StatChip
                  label={t('characters.queueState')}
                  tone={QUEUE_STATE_TONE[queue.state]}
                  value={t(`characters.queueStates.${queue.state}`)}
                />
                {queue.fetchedAt && <DataAgeBadge date={queue.fetchedAt} />}
              </>
            )}
          </span>
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
            size="sm"
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
        <TextInput
          autoFocus
          size="sm"
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
          className="flex-1"
        />
      ) : (
        <h2
          className="flex-1 truncate text-xs font-semibold tracking-widest text-text-dim uppercase"
          onDoubleClick={() => setRenaming(true)}
        >
          {group.name}
        </h2>
      )}
      {/* Icon actions, like every other editable-row header in the app (the
          Skill Plan and Build Plan lists): the group name is the row, the
          actions are the adornment, and four labelled buttons left the name
          nothing on a phone. Each label names the group so a screen reader
          hears which one it is on. */}
      <IconButton
        size="sm"
        icon={<Icon.Ascending />}
        label={t('characters.moveGroupUp', { name: group.name })}
        onClick={() => onMove(index, -1)}
        disabled={index === 0}
      />
      <IconButton
        size="sm"
        icon={<Icon.Descending />}
        label={t('characters.moveGroupDown', { name: group.name })}
        onClick={() => onMove(index, 1)}
        disabled={index === groupCount - 1}
      />
      <IconButton
        size="sm"
        icon={<Icon.Rename />}
        label={`${t('characters.renameGroup')} ${group.name}`}
        onClick={() => setRenaming(true)}
      />
      <IconButton
        size="sm"
        icon={<Icon.Close />}
        tone="danger"
        label={`${t('characters.deleteGroup')} ${group.name}`}
        onClick={() => {
          if (window.confirm(t('characters.deleteGroupConfirm'))) onRemove(group.id);
        }}
      />
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
  const [search, setSearch] = useState('');
  const [removingCharacter, setRemovingCharacter] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [deferredNoticeName, setDeferredNoticeName] = useState<string | null>(null);

  const charactersById = useMemo(
    () => new Map((characters ?? []).map((character) => [character.characterId, character])),
    [characters]
  );

  const query = search.trim().toLowerCase();
  function matchesSearch(characterId: number): boolean {
    if (!query) return true;
    const character = charactersById.get(characterId);
    const corpName = publicInfo[characterId]?.corporationName ?? '';
    return (
      (character?.name.toLowerCase().includes(query) ?? false) ||
      corpName.toLowerCase().includes(query)
    );
  }

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
      setStats(rosterSortStats(roster));
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

  function requestRemoveCharacter(characterId: number, name: string) {
    setRemovingCharacter({ id: characterId, name });
  }

  async function confirmRemoveCharacter() {
    if (!removingCharacter) return;
    const { id, name } = removingCharacter;
    setRemovingCharacter(null);
    const { remotePurged } = await removeCharacter(id, isSyncConfigured());
    if (!remotePurged) setDeferredNoticeName(name);
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
    // A group (or the ungrouped section) that the filter emptied just shows
    // nothing here — repeating a "no matches" line under every such section
    // would be noise once any other section still has results. The one case
    // worth telling the user about, the whole roster coming up empty, is
    // handled once, above every section, by the caller.
    const filteredIds = characterIds.filter((characterId) => matchesSearch(characterId));
    if (filteredIds.length === 0) return null;

    const sortedIds = sortCharacterIds(filteredIds, stats, sortKey, sortDirection);
    return (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sortedIds.map((characterId) => {
          const character = charactersById.get(characterId);
          if (!character) return null;
          return (
            <CharacterCard
              key={characterId}
              character={character}
              info={publicInfo[characterId]}
              stats={stats.get(characterId)}
              queue={queueById.get(characterId)}
              groups={groupsValue.groups}
              groupId={groupIdByCharacterId.get(characterId) ?? null}
              onSelect={(id) => void select(id)}
              onMoveToGroup={(id, groupId) => void handleMoveToGroup(id, groupId)}
              onRemove={(id, name) => requestRemoveCharacter(id, name)}
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
  const noSearchMatches = query.length > 0 && !allIds.some((id) => matchesSearch(id));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('characters.title')}
        actions={
          <>
            {/*
              The add-a-character branch, not a re-auth: SSO decides who comes
              back, so unioning with the *active* Character's grant would ask
              the newcomer to consent to scopes aimed at somebody else (#295).
            */}
            <Button variant="primary" size="sm" onClick={() => void beginAddCharacterLogin()}>
              {t('characters.add')}
            </Button>
          </>
        }
      />

      {characters.length === 0 ? (
        <EmptyState title={t('characters.emptyTitle')} hint={t('characters.emptyHint')} />
      ) : (
        <>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('characters.searchPlaceholder')}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={sortKey}
                onValueChange={(value) => setSortKey(value as CharacterSortKey)}
              >
                <SelectTrigger size="sm" aria-label={t('characters.sortBy')} className="w-40">
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
              <IconButton
                size="sm"
                icon={sortDirection === 'asc' ? <Icon.Ascending /> : <Icon.Descending />}
                label={t('characters.sortDirection')}
                onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
              />
              {addingGroup ? (
                <TextInput
                  autoFocus
                  size="sm"
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
                  className="w-40"
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

          {noSearchMatches ? (
            <EmptyState title={t('characters.noSearchMatches')} />
          ) : (
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
          )}
        </>
      )}

      <Modal
        open={removingCharacter !== null}
        onClose={() => setRemovingCharacter(null)}
        title={t('characters.remove')}
      >
        <p className="text-xs text-text-dim">
          {removingCharacter && t('characters.removeConfirm', { name: removingCharacter.name })}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={() => setRemovingCharacter(null)}>
            {t('characters.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => void confirmRemoveCharacter()}>
            {t('characters.remove')}
          </Button>
        </div>
      </Modal>

      <Modal
        open={deferredNoticeName !== null}
        onClose={() => setDeferredNoticeName(null)}
        title={t('characters.removeDeferredNoticeTitle')}
      >
        <p className="text-xs text-text-dim">
          {deferredNoticeName && t('characters.removeDeferredNotice', { name: deferredNoticeName })}
        </p>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => setDeferredNoticeName(null)}>
            {t('characters.ok')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
