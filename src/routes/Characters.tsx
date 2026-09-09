import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CharacterRecord } from '@/db';
import {
  Button,
  CharacterAvatar,
  DataAgeBadge,
  DataTable,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
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
  STAT_CHIP_TONE_TEXT_CLASS,
  TextInput,
  Tooltip,
  type DataTableColumn,
  type StatChipTone,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { isSyncConfigured } from '@/app/syncStatus';
import { usePublicInfo, type PublicInfoEntry } from '@/stores/publicInfo';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useFontScale, FONT_SCALE_STEPS, type FontScale } from '@/lib/fontScale';
import { loadRosterSnapshot, type RosterEntry } from '@/features/character/roster';
import { loadRosterAttention, type AttentionEntry } from '@/features/character/rosterAttention';
import { useAlertCountsByCharacter } from '@/features/notifications/alertCountsByCharacter';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from '@/features/character/spExtractionSettings';
import { isSpExtractionReady } from '@/engine/spExtraction';
import { maxJobSlots, type JobSlotCategory, type JobSlotSkills } from '@/engine/industry/jobSlots';
import { jobSlotSkillsFromCharacterSkills } from '@/features/character/jobSlotSkills';
import {
  availableCharacterColumns,
  useCharacterViewMode,
  useVisibleCharacterColumns,
  visibleAvailableColumns,
  type CharacterColumnId,
} from '@/features/character/characterColumns';
import { ATTENTION_RANK, ATTENTION_TONE as PI_ATTENTION_TONE } from '@/engine/pi/colonyStatus';
import { deriveQueueState, type QueueState } from '@/features/skills/queueStatus';
import { removeCharacter } from '@/features/character/removeCharacter';
import { CharacterRowContextMenu } from '@/features/character/CharacterRowContextMenu';
import { updateGroups, useOverviewGroups } from '@/features/character/overviewGroups';
import {
  isCharacterStarred,
  partitionStarredFirst,
  pruneStarredCharacters,
  starredCharactersNeedPruning,
  useStarredCharacters,
  withToggledStar,
} from '@/features/character/starredCharacters';
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

// Same "most-needs-attention first" ordering as PI's ATTENTION_RANK, mapped
// onto training's own tones: paused (danger) worst, then endingSoon (warning),
// then idle/unknown (default, no distinct order between the two), then
// training (success) last since it needs no attention at all.
const QUEUE_STATE_RANK: Record<QueueState, number> = {
  paused: 0,
  endingSoon: 1,
  idle: 2,
  unknown: 2,
  training: 3,
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
  starred: boolean;
  onSelect: (characterId: number) => void;
  onToggleStar: (characterId: number) => void;
  onMoveToGroup: (characterId: number, groupId: string | null) => void;
  onRemove: (characterId: number, name: string) => void;
}

/**
 * The staler of two optional fetch times — the card's one combined age badge
 * reads as "how stale is the worst part of this card", never the freshest
 * field alone, so it can't imply everything is fresher than it is.
 */
function olderOf(a: Date | null | undefined, b: Date | null | undefined): Date | undefined {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/** The one "how stale is this character" rule (`olderOf`'s doc comment) — shared by the card badge and the table's `lastSynced` column so they can't drift into disagreeing about the same character. */
function characterLastSynced(
  stats: CharacterSortStats | undefined,
  queue: QueueInfo | undefined
): Date | undefined {
  return olderOf(olderOf(stats?.skillPointsFetchedAt, stats?.walletFetchedAt), queue?.fetchedAt);
}

function CharacterCard({
  character,
  info,
  stats,
  queue,
  groups,
  groupId,
  starred,
  onSelect,
  onToggleStar,
  onMoveToGroup,
  onRemove,
}: CharacterCardProps) {
  const { t } = useTranslation();
  // One badge for the whole card, not one per stat (that was the actual
  // complaint — three "Xm ago"s in a row): the oldest of whichever fields
  // this character has cached, so the card never overstates its freshness.
  const lastSynced = characterLastSynced(stats, queue);

  return (
    <li className="flex flex-col gap-2 rounded-xs border border-line bg-panel/85 p-3 backdrop-blur-sm transition-colors hover:border-line-bright hover:bg-panel-2">
      <div className="flex flex-wrap items-start gap-2">
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
            {/* The dot rides the name's own line, not a corner of the card:
                it needs no room of its own, so the identity block loses
                nothing to make space for it. `min-w-0` on this row (not just
                the outer `span`) is what lets the name still truncate instead
                of pushing the dot off — and shrinking the name never touches
                the corp/alliance lines below, which are separate rows. */}
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{character.name}</span>
              {lastSynced && <DataAgeBadge date={lastSynced} dotOnly className="shrink-0" />}
            </span>
            <span className="block truncate text-xs text-text-dim">
              {info?.corporationName ?? t('common.unknown')}
            </span>
            <span className="block truncate text-xs text-text-faint">
              {info?.allianceName ?? t('common.unknown')}
            </span>
          </span>
        </button>
        {/* Group and remove: the card's own controls, not part of the
            name/corp/alliance identity block, so they sit at the top right
            rather than crowding the stat row below. */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Filled when starred, outline when not — the state is on the glyph
              as well as in the accent `pressed` treatment, so it survives a
              reader who can't tell the two colours apart. The label says which
              way the press goes, not just which card it belongs to. */}
          <IconButton
            icon={<Icon.Pin weight={starred ? 'fill' : 'light'} />}
            label={t(starred ? 'characters.unstar' : 'characters.star', { name: character.name })}
            pressed={starred}
            onClick={() => onToggleStar(character.characterId)}
          />
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
          <IconButton
            icon={<Icon.Close />}
            tone="danger"
            label={t('characters.removeButtonLabel', { name: character.name })}
            onClick={() => onRemove(character.characterId, character.name)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatChip
          label={t('characters.spLabel')}
          value={
            stats?.skillPoints === undefined
              ? t('common.unknown')
              : formatCompactNumber(stats.skillPoints)
          }
        />
        <StatChip
          label={t('characters.walletLabel')}
          value={stats?.wallet === undefined ? t('common.unknown') : formatIskCompact(stats.wallet)}
        />
        {queue && (
          <StatChip
            label={t('characters.queueState')}
            tone={QUEUE_STATE_TONE[queue.state]}
            value={t(`characters.queueStates.${queue.state}`)}
          />
        )}
      </div>
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

/** One character's table row — everything a column might render, gathered once per character rather than re-derived per cell. */
interface CharacterRow {
  character: CharacterRecord;
  info: PublicInfoEntry | undefined;
  stats: CharacterSortStats | undefined;
  queue: QueueInfo | undefined;
  attention: AttentionEntry | undefined;
  alertCount: number;
  /** From the same roster snapshot `stats` comes from — undefined until skills have loaded once. */
  jobSlotSkills: JobSlotSkills | undefined;
  /** Raw `total_sp` (not `correctedTotalSp`) — see `totalSpMap`'s doc comment. */
  totalSp: number | undefined;
  starred: boolean;
}

/** `queueById`'s shape, built once from a roster snapshot — shared by the initial cache-only load and the "Refresh all" live reload so the two never compute it differently. */
function queueInfoMap(roster: readonly RosterEntry[], nowMs: number): Map<number, QueueInfo> {
  return new Map(
    roster.map((entry) => [
      entry.characterId,
      {
        state: deriveQueueState(entry.queue?.data, nowMs),
        fetchedAt: entry.queue?.fetchedAt ?? null,
      },
    ])
  );
}

/**
 * Job-slot skill levels from the same roster snapshot `stats` comes from —
 * `roster.ts` already fetches `/skills` for `correctedTotalSp`, so this reads
 * the skills row already in hand rather than fetching it a second time. A
 * character with no cached skills row at all is simply absent, not zero:
 * `jobSlotSkillsFromCharacterSkills([])` would otherwise misreport "no
 * capacity" for a character whose skills just haven't loaded yet.
 */
function jobSlotSkillsMap(roster: readonly RosterEntry[]): Map<number, JobSlotSkills> {
  const map = new Map<number, JobSlotSkills>();
  for (const entry of roster) {
    if (entry.skills?.data) {
      map.set(entry.characterId, jobSlotSkillsFromCharacterSkills(entry.skills.data.skills));
    }
  }
  return map;
}

/**
 * Raw `total_sp`, not `correctedTotalSp` — deliberately, and only for this
 * one column. `correctedTotalSp` exists so a displayed SP total doesn't
 * contradict a per-skill figure shown beside it (roster.ts's own comment);
 * SP-extraction readiness needs no such agreement, and it must match what
 * `pollDomains.ts`'s `spExtractionDomain` alerts on (also raw `total_sp`), or
 * the table and the alert could disagree about whether a character is ready.
 */
function totalSpMap(roster: readonly RosterEntry[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const entry of roster) {
    if (entry.skills?.data) map.set(entry.characterId, entry.skills.data.total_sp);
  }
  return map;
}

/**
 * One `manufacturing`/`science`/`reaction` job-slot column — three of these,
 * not one combined column, so each category gets its own header-click sort
 * (`DataTable` sorts one `sortValue` per column; a pilot who wants "who's out
 * of reaction slots" specifically couldn't ask that of a single merged
 * column). The number shown is *open* (free) slots — `max - running` — not
 * the running count: "Open jobs" names how much room is left, and reading it
 * as "jobs currently open/running" would say the opposite of what a pilot
 * checking for spare capacity wants to know. `max` comes from
 * `jobSlotSkills` (trained skills), `running` from `attention.jobCounts`
 * (live industry jobs) — either missing means unknown, not zero.
 */
function openJobsColumn(
  id: CharacterColumnId,
  category: JobSlotCategory,
  t: (key: string, options?: Record<string, unknown>) => string
): DataTableColumn<CharacterRow> {
  return {
    id,
    header: t(`characters.jobSlotCategory.${category}`),
    sortValue: (row) => {
      const running = row.attention?.jobCounts?.[category];
      const max = row.jobSlotSkills ? maxJobSlots(row.jobSlotSkills)[category] : undefined;
      return running === undefined || max === undefined ? undefined : max - running;
    },
    render: (row) => {
      const running = row.attention?.jobCounts?.[category];
      const max = row.jobSlotSkills ? maxJobSlots(row.jobSlotSkills)[category] : undefined;
      if (running === undefined || max === undefined) return '—';
      const open = max - running;
      // Red at zero spare slots, yellow below half spare, plain text
      // otherwise — a graduated "how much room is left" read using the same
      // tone tokens as every other column, not a one-off continuous colour.
      const tone = open === 0 ? 'text-danger' : open / max < 0.5 ? 'text-warning' : 'text-text';
      return (
        <Tooltip content={t('characters.openJobsTooltip', { used: running, max })}>
          <span className={tone}>{open}</span>
        </Tooltip>
      );
    },
  };
}

/**
 * Every column the table can show, keyed by id — the picker offers a subset
 * of these keys, and the table renders whichever the pilot has checked, in
 * this record's own order (not the order they were picked in).
 */
function buildColumns(
  t: (key: string, options?: Record<string, unknown>) => string,
  spExtractionThresholdSp: number,
  onToggleStarred: (characterId: number) => void
): Record<CharacterColumnId, DataTableColumn<CharacterRow>> {
  return {
    name: {
      id: 'name',
      header: t('characters.column.name'),
      primary: true,
      sortValue: (row) => row.character.name,
      render: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <CharacterAvatar
            characterId={row.character.characterId}
            size="sm"
            loading="lazy"
            alt={t('characters.portraitAlt', { name: row.character.name })}
          />
          <span className="truncate font-medium">{row.character.name}</span>
        </span>
      ),
    },
    corp: {
      id: 'corp',
      header: t('characters.column.corp'),
      className: 'text-text-dim',
      sortValue: (row) => row.info?.corporationName ?? '',
      render: (row) => row.info?.corporationName ?? t('common.unknown'),
    },
    spTotal: {
      id: 'spTotal',
      header: t('characters.column.spTotal'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.stats?.skillPoints,
      render: (row) =>
        row.stats?.skillPoints === undefined
          ? t('common.unknown')
          : formatCompactNumber(row.stats.skillPoints),
    },
    wallet: {
      id: 'wallet',
      header: t('characters.column.wallet'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.stats?.wallet,
      render: (row) =>
        row.stats?.wallet === undefined ? t('common.unknown') : formatIskCompact(row.stats.wallet),
    },
    lastSynced: {
      id: 'lastSynced',
      header: t('characters.column.lastSynced'),
      sortValue: (row) => characterLastSynced(row.stats, row.queue)?.getTime(),
      render: (row) => {
        const age = characterLastSynced(row.stats, row.queue);
        return age ? <DataAgeBadge date={age} /> : t('common.unknown');
      },
    },
    training: {
      id: 'training',
      header: t('characters.column.training'),
      sortValue: (row) => (row.queue ? QUEUE_STATE_RANK[row.queue.state] : undefined),
      render: (row) =>
        row.queue ? (
          <span className={STAT_CHIP_TONE_TEXT_CLASS[QUEUE_STATE_TONE[row.queue.state]]}>
            {t(`characters.queueStates.${row.queue.state}`)}
          </span>
        ) : (
          '—'
        ),
    },
    openJobsManufacturing: openJobsColumn('openJobsManufacturing', 'manufacturing', t),
    openJobsScience: openJobsColumn('openJobsScience', 'science', t),
    openJobsReaction: openJobsColumn('openJobsReaction', 'reaction', t),
    pi: {
      id: 'pi',
      header: t('characters.column.pi'),
      sortValue: (row) =>
        row.attention?.piAttention === undefined
          ? undefined
          : ATTENTION_RANK[row.attention.piAttention],
      render: (row) =>
        row.attention?.piAttention === undefined ? (
          '—'
        ) : (
          <span className={STAT_CHIP_TONE_TEXT_CLASS[PI_ATTENTION_TONE[row.attention.piAttention]]}>
            {t(`pi.attention.${row.attention.piAttention}`)}
          </span>
        ),
    },
    spReady: {
      id: 'spReady',
      header: t('characters.column.spReady'),
      sortValue: (row) =>
        row.totalSp === undefined
          ? undefined
          : Number(isSpExtractionReady(row.totalSp, spExtractionThresholdSp)),
      render: (row) =>
        row.totalSp !== undefined && isSpExtractionReady(row.totalSp, spExtractionThresholdSp) ? (
          <span className={STAT_CHIP_TONE_TEXT_CLASS.success}>{t('characters.spReadyYes')}</span>
        ) : (
          '—'
        ),
    },
    alerts: {
      id: 'alerts',
      header: t('characters.column.alerts'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.alertCount,
      render: (row) =>
        row.alertCount > 0 ? (
          <span className={STAT_CHIP_TONE_TEXT_CLASS.warning}>{row.alertCount}</span>
        ) : (
          '—'
        ),
    },
    starred: {
      id: 'starred',
      header: t('characters.column.starred'),
      align: 'right',
      sortValue: (row) => Number(row.starred),
      // Row click navigates to Overview (see the table's `onRowClick`) — this
      // button must not also fire that when toggling the star, so it stops
      // the click before it bubbles to the `<tr>`.
      render: (row) => (
        <span onClick={(event) => event.stopPropagation()}>
          <IconButton
            size="sm"
            icon={<Icon.Pin weight={row.starred ? 'fill' : 'light'} />}
            label={t(row.starred ? 'characters.unstar' : 'characters.star', {
              name: row.character.name,
            })}
            pressed={row.starred}
            onClick={() => onToggleStarred(row.character.characterId)}
          />
        </span>
      ),
    },
  };
}

interface ColumnPickerMenuProps {
  available: readonly CharacterColumnId[];
  visible: readonly CharacterColumnId[];
  columnsById: Record<CharacterColumnId, DataTableColumn<CharacterRow>>;
  onToggle: (id: CharacterColumnId) => void;
}

/** Which columns show in table view — a menu, not a form: every toggle is already reversible in one tap (same reasoning as CalendarKindFilterMenu). Labels come straight from `columnsById`'s own already-translated `header`, not a second id->i18n-key table that could drift from it. */
function ColumnPickerMenu({ available, visible, columnsById, onToggle }: ColumnPickerMenuProps) {
  const { t } = useTranslation();
  const visibleSet = new Set(visible);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="md">{t('characters.columnsButton')}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <p className="px-2 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('characters.columnsMenuTitle')}
        </p>
        {available.map((id) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={visibleSet.has(id)}
            // A picker that closes on the first check makes picking several
            // columns take one round trip per column.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(id)}
          >
            {columnsById[id].header}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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

  const starred = useStarredCharacters((state) => state.value);
  const starredHydrated = useStarredCharacters((state) => state.hydrated);
  const hydrateStarred = useStarredCharacters((state) => state.hydrate);
  const setStarred = useStarredCharacters((state) => state.setValue);

  const density = useFontScale((state) => state.value);
  const setDensity = useFontScale((state) => state.setValue);

  const viewMode = useCharacterViewMode((state) => state.value);
  const setViewMode = useCharacterViewMode((state) => state.setValue);
  const hydrateViewMode = useCharacterViewMode((state) => state.hydrate);

  const visibleColumns = useVisibleCharacterColumns((state) => state.value);
  const setVisibleColumns = useVisibleCharacterColumns((state) => state.setValue);
  const hydrateVisibleColumns = useVisibleCharacterColumns((state) => state.hydrate);

  const spExtractionEnabled = useSpExtractionMonitoringEnabled((state) => state.value);
  const hydrateSpExtractionEnabled = useSpExtractionMonitoringEnabled((state) => state.hydrate);
  const spExtractionThreshold = useSpExtractionThresholdSp((state) => state.value);
  const hydrateSpExtractionThreshold = useSpExtractionThresholdSp((state) => state.hydrate);

  const alertCounts = useAlertCountsByCharacter();

  const [sortKey, setSortKey] = useState<CharacterSortKey>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [stats, setStats] = useState<Map<number, CharacterSortStats>>(new Map());
  const [queueById, setQueueById] = useState<Map<number, QueueInfo>>(new Map());
  const [attentionById, setAttentionById] = useState<Map<number, AttentionEntry>>(new Map());
  const [jobSlotSkillsById, setJobSlotSkillsById] = useState<Map<number, JobSlotSkills>>(new Map());
  const [totalSpById, setTotalSpById] = useState<Map<number, number>>(new Map());

  /** The one place a fresh roster snapshot becomes the four derived maps it feeds — shared by the cache-only load effect and "Refresh all" so a future fifth map only needs adding here. */
  function applyRoster(roster: readonly RosterEntry[], now: number) {
    setStats(rosterSortStats(roster));
    setQueueById(queueInfoMap(roster, now));
    setJobSlotSkillsById(jobSlotSkillsMap(roster));
    setTotalSpById(totalSpMap(roster));
  }

  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [search, setSearch] = useState('');
  const [removingCharacter, setRemovingCharacter] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [deferredNoticeName, setDeferredNoticeName] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);

  const charactersById = useMemo(
    () => new Map((characters ?? []).map((character) => [character.characterId, character])),
    [characters]
  );

  // Not `useMemo`: `handleToggleStar` below closes over `starred`/`setStarred`
  // and is a fresh function every render anyway, so a memoized wrapper here
  // would just recompute every render regardless — `buildColumns` itself is
  // cheap (a handful of object literals, no per-character work).
  const columnsById = buildColumns(t, spExtractionThreshold, (id) => void handleToggleStar(id));
  const availableColumnIds = availableCharacterColumns(spExtractionEnabled);
  // `id` is already known available here, so this is just "is it checked" —
  // `visibleAvailableColumns` (below, `handleToggleColumn`'s own zero-columns
  // guard) is for narrowing the *raw stored* list, which can hold ids that
  // aren't available right now; this list already excludes those.
  const activeColumnIds = availableColumnIds.filter((id) => visibleColumns.includes(id));

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
    void hydrateStarred();
  }, [hydrateStarred]);

  useEffect(() => {
    void hydrateViewMode();
  }, [hydrateViewMode]);

  useEffect(() => {
    void hydrateVisibleColumns();
  }, [hydrateVisibleColumns]);

  useEffect(() => {
    void hydrateSpExtractionEnabled();
  }, [hydrateSpExtractionEnabled]);

  useEffect(() => {
    void hydrateSpExtractionThreshold();
  }, [hydrateSpExtractionThreshold]);

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
      applyRoster(roster, now);
    })();
    return () => {
      cancelled = true;
    };
  }, [characters]);

  // Mirrors the cache-only effect above, cache-only by default: manufacturing
  // running counts and PI attention across the whole roster.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!characters || characters.length === 0) {
        if (!cancelled) setAttentionById(new Map());
        return;
      }
      const attention = await loadRosterAttention();
      if (cancelled) return;
      setAttentionById(new Map(attention.map((entry) => [entry.characterId, entry])));
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

  // Same self-heal for stars, and for the same reason — but note this lives
  // here rather than in `confirmRemoveCharacter`: a Character can also leave
  // this device without passing through that button (a sold Character, dropped
  // by `handleOwnerHashChange` — see removeCharacter.ts's header). Reconciling
  // against the roster catches every route out; a hook on the confirm handler
  // would catch one of them.
  useEffect(() => {
    if (!characters || !starredHydrated) return;
    const existingIds = new Set(characters.map((character) => character.characterId));
    if (starredCharactersNeedPruning(starred, existingIds)) {
      void setStarred(pruneStarredCharacters(starred, existingIds));
    }
  }, [characters, starred, starredHydrated, setStarred]);

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

  /**
   * Live pull for every character, capped-speed — same "cache-first, one
   * explicit button for live" rule the PI alt-colonies view already follows,
   * rather than a new pattern for this page.
   */
  async function handleRefreshAll() {
    setRefreshingAll(true);
    try {
      const now = Date.now();
      const [roster, attention] = await Promise.all([
        loadRosterSnapshot({ live: true }),
        loadRosterAttention({ live: true }),
      ]);
      applyRoster(roster, now);
      setAttentionById(new Map(attention.map((entry) => [entry.characterId, entry])));
    } finally {
      setRefreshingAll(false);
    }
  }

  function handleToggleColumn(id: CharacterColumnId) {
    const next = visibleColumns.includes(id)
      ? visibleColumns.filter((existing) => existing !== id)
      : [...visibleColumns, id];
    // A table with zero *rendered* columns is a blank page with no
    // explanation — guard against the filtered/available count, not the raw
    // stored list: `visibleColumns` can carry ids `availableCharacterColumns`
    // currently excludes (e.g. `spReady` while monitoring is off), so a raw
    // `next.length` check can stay non-zero while every id left actually
    // renders nothing.
    if (visibleAvailableColumns(next, spExtractionEnabled).length === 0) return;
    void setVisibleColumns(next);
  }

  async function handleToggleStar(characterId: number) {
    await setStarred(withToggledStar(starred, characterId));
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

    // Starred first, then the chosen sort key — a layer on top of the sort,
    // not a replacement for it, so a star raises one card and leaves the order
    // of everything around it exactly as the user asked for.
    const sortedIds = partitionStarredFirst(
      sortCharacterIds(filteredIds, stats, sortKey, sortDirection),
      starred
    );

    if (viewMode === 'table') {
      const rows: CharacterRow[] = sortedIds
        .map((characterId) => charactersById.get(characterId))
        .filter((character): character is CharacterRecord => character !== undefined)
        .map((character) => ({
          character,
          info: publicInfo[character.characterId],
          stats: stats.get(character.characterId),
          queue: queueById.get(character.characterId),
          attention: attentionById.get(character.characterId),
          alertCount: alertCounts.get(character.characterId) ?? 0,
          jobSlotSkills: jobSlotSkillsById.get(character.characterId),
          totalSp: totalSpById.get(character.characterId),
          starred: isCharacterStarred(starred, character.characterId),
        }));
      return (
        // Deliberate deviation from DataTable's usual `.dt-stack` collapse on
        // mobile (docs/context/decisions/20260909-130638-characters-table-
        // view-mobile-scroll-roster-overview-split.md): a real, comparable
        // table stays a table, and scrolls sideways instead, at every width.
        <div className="overflow-x-auto">
          <DataTable
            columns={activeColumnIds.map((id) => columnsById[id])}
            rows={rows}
            rowKey={(row) => row.character.characterId}
            label={t('characters.title')}
            responsive="table"
            onRowClick={(row) => void select(row.character.characterId)}
            rowContextMenu={(row, tr) => (
              <CharacterRowContextMenu characterId={row.character.characterId}>
                {tr}
              </CharacterRowContextMenu>
            )}
          />
        </div>
      );
    }

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
              starred={isCharacterStarred(starred, characterId)}
              onSelect={(id) => void select(id)}
              onToggleStar={(id) => void handleToggleStar(id)}
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
            {characters.length > 0 && (
              <Button
                size="md"
                onClick={() => void handleRefreshAll()}
                disabled={refreshingAll}
                title={t('characters.refreshAllHint')}
              >
                <Icon.Refresh className={refreshingAll ? 'animate-spin' : undefined} />
                {refreshingAll ? t('characters.refreshingAll') : t('characters.refreshAll')}
              </Button>
            )}
            {/*
              The add-a-character branch, not a re-auth: SSO decides who comes
              back, so unioning with the *active* Character's grant would ask
              the newcomer to consent to scopes aimed at somebody else (#295).
            */}
            <Button variant="primary" size="md" onClick={() => void beginAddCharacterLogin()}>
              {t('characters.add')}
            </Button>
          </>
        }
      />

      {characters.length === 0 ? (
        <EmptyState title={t('characters.emptyTitle')} hint={t('characters.emptyHint')} />
      ) : (
        <>
          <FilterBar
            value={{ sortKey, sortDirection }}
            onChange={(next) => {
              setSortKey(next.sortKey);
              setSortDirection(next.sortDirection);
            }}
            search={
              <SearchInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('characters.searchPlaceholder')}
                className="min-w-40 flex-1"
              />
            }
          >
            {(draft, setDraft) => (
              <>
                <FilterField label={t('characters.sortBy')}>
                  <Select
                    value={draft.sortKey}
                    onValueChange={(value) =>
                      setDraft({ ...draft, sortKey: value as CharacterSortKey })
                    }
                  >
                    <SelectTrigger size="md" aria-label={t('characters.sortBy')} className="w-40">
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
                </FilterField>
                <FilterField label={t('characters.sortDirection')} stretch={false}>
                  <IconButton
                    size="md"
                    icon={draft.sortDirection === 'asc' ? <Icon.Ascending /> : <Icon.Descending />}
                    label={t('characters.sortDirection')}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        sortDirection: draft.sortDirection === 'asc' ? 'desc' : 'asc',
                      })
                    }
                  />
                </FilterField>
              </>
            )}
          </FilterBar>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {addingGroup ? (
                <TextInput
                  autoFocus
                  size="md"
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
                <Button size="md" onClick={() => setAddingGroup(true)}>
                  {t('characters.newGroup')}
                </Button>
              )}
            </div>
            <div
              role="group"
              aria-label={t('characters.densityLabel')}
              className="flex flex-wrap gap-2"
            >
              {FONT_SCALE_STEPS.map((step) => (
                <FilterChip
                  key={step}
                  size="md"
                  label={t(DENSITY_LABEL_KEYS[step])}
                  selected={density === step}
                  onToggle={() => void setDensity(step)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label={t('characters.viewModeLabel')} className="flex gap-2">
              <FilterChip
                size="md"
                label={t('characters.viewCards')}
                selected={viewMode === 'card'}
                onToggle={() => void setViewMode('card')}
              />
              <FilterChip
                size="md"
                label={t('characters.viewTable')}
                selected={viewMode === 'table'}
                onToggle={() => void setViewMode('table')}
              />
            </div>
            {viewMode === 'table' && (
              <ColumnPickerMenu
                available={availableColumnIds}
                visible={activeColumnIds}
                columnsById={columnsById}
                onToggle={handleToggleColumn}
              />
            )}
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
