import { cx } from '@/lib/cx';
import {
  focusRingClassName,
  interactiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { HintText } from '@/components/ui/HintText';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CharacterRecord } from '@/db';
import {
  Button,
  CharacterAvatar,
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  IconButton,
  IskAmount,
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
  StatChips,
  STAT_CHIP_TONE_TEXT_CLASS,
  TextInput,
  Toast,
  Tooltip,
  type DataTableColumn,
  type StatChipTone,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginAddCharacterLogin } from '@/app/loginFlow';
import { NeedsLoginNotice } from '@/app/AuthFailureNotice';
import { useAuthFailure } from '@/stores/authFailure';
import { CustomizePermissionsDialog } from '@/features/permissions/CustomizePermissionsDialog';
import { isSyncConfigured } from '@/app/syncStatus';
import { usePublicInfo, type PublicInfoEntry } from '@/stores/publicInfo';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useFontScale, FONT_SCALE_STEPS, type FontScale } from '@/lib/fontScale';
import { useNow } from '@/lib/useNow';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { loadRosterSnapshot, type RosterEntry } from '@/features/character/roster';
import {
  rosterCoreMap,
  mergeRosterCore,
  type QueueInfo,
  type RosterCore,
} from '@/features/character/rosterView';
import {
  loadRosterAttention,
  isPiExpired,
  type AttentionEntry,
} from '@/features/character/rosterAttention';
import { useAlertCountsByCharacter } from '@/features/notifications/alertCountsByCharacter';
import {
  useNotificationPreferences,
  isNotTrainingAlertEnabledFor,
} from '@/features/notifications/preferences';
import {
  useSpExtractionMonitoringEnabled,
  useSpExtractionThresholdSp,
} from '@/features/character/spExtractionSettings';
import { extractionTotalIsk, extractorCount, isSpExtractionReady } from '@/engine/spExtraction';
import { formatIskCompact } from '@/lib/isk';
import { useExtractionPrices } from '@/features/character/useExtractionPrices';
import { maxJobSlots, type JobSlotCategory, type JobSlotSkills } from '@/engine/industry/jobSlots';
import {
  availableCharacterColumns,
  migrateVisibleColumns,
  useCharacterColumnsMigrated,
  useCharacterViewMode,
  useVisibleCharacterColumns,
  visibleAvailableColumns,
  type CharacterColumnId,
} from '@/features/character/characterColumns';
import { ATTENTION_RANK, ATTENTION_TONE as PI_ATTENTION_TONE } from '@/engine/pi/colonyStatus';
import { type QueueState } from '@/features/skills/queueStatus';
import { formatCountdown, formatDuration } from '@/lib/duration';
import { formatTimestamp } from '@/lib/timestamp';
import { useTimeZone } from '@/lib/timeFormat';
import { removeCharacterAfterSync } from '@/features/character/removeCharacter';
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
  sortCharacterIds,
  ungroupedCharacterIds,
  type CharacterGroup,
  type CharacterSortKey,
  type CharacterSortStats,
  type SortDirection,
} from '@/features/character/groups';
import { formatCompactNumber } from '@/lib/compactNumber';
import {
  boolParam,
  enumParam,
  nullableTextParam,
  optionalEnumParam,
  optionalSortParam,
  textParam,
} from '@/lib/urlState';
import { useUrlParam, useUrlParams } from '@/lib/useUrlState';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { charactersCsvColumns } from '@/features/character/charactersCsv';

const UNGROUPED_VALUE = '__ungrouped__';

// `idle` is `warning`, not `default`: the app already raises a
// `characterNotTraining` warning alert for an idle queue, so this chip must
// not disagree with it (issue #1731). `queueChipTone` below overrides that
// back to `default` for the one Character-level opt-out that alert has.
const QUEUE_STATE_TONE: Record<QueueState, StatChipTone> = {
  training: 'success',
  endingSoon: 'warning',
  paused: 'danger',
  idle: 'warning',
  unknown: 'default',
};

// Same "most-needs-attention first" ordering as PI's ATTENTION_RANK, mapped
// onto training's own tones: paused and idle (both now warning-or-worse)
// share rank 0, then endingSoon, then unknown (no cached queue yet), then
// training last since it needs no attention at all.
const QUEUE_STATE_RANK: Record<QueueState, number> = {
  paused: 0,
  idle: 0,
  endingSoon: 1,
  unknown: 2,
  training: 3,
};

/**
 * `QUEUE_STATE_TONE`, overridden back to `default` for an idle queue when
 * this Character has muted the `characterNotTraining` alert in its feed
 * channel — the alert's own only per-pilot opt-out (issue #1731), e.g. a
 * deliberately parked alt banking skill points. Every other state ignores
 * the opt-out: it exists to silence the idle warning specifically, not to
 * dim a paused or ending-soon queue.
 */
function queueChipTone(state: QueueState, notTrainingAlertEnabled: boolean): StatChipTone {
  if (state === 'idle' && !notTrainingAlertEnabled) return 'default';
  return QUEUE_STATE_TONE[state];
}

/** `QUEUE_STATE_RANK`, with the same opt-out override as `queueChipTone` — a muted idle Character sorts with `unknown`, not with `paused`, so its position agrees with its now-neutral chip. */
function queueChipRank(state: QueueState, notTrainingAlertEnabled: boolean): number {
  if (state === 'idle' && !notTrainingAlertEnabled) return QUEUE_STATE_RANK.unknown;
  return QUEUE_STATE_RANK[state];
}

const DENSITY_LABEL_KEYS = {
  0.875: 'characters.densityCompact',
  1: 'characters.densityCozy',
  1.125: 'characters.densityComfortable',
  1.25: 'characters.densitySpacious',
} as const satisfies Record<FontScale, string>;

const SORT_KEYS: readonly CharacterSortKey[] = ['name', 'skillPoints', 'wallet', 'group', 'alerts'];
const SORT_DIRECTIONS: readonly SortDirection[] = ['asc', 'desc'];
/** `unknown` left out: it means "no cached queue yet", not a state anyone filters for. */
const QUEUE_FILTER_STATES: readonly QueueState[] = ['training', 'endingSoon', 'paused', 'idle'];
/** Radix `SelectItem` can't take `''`, so "any corporation" needs a sentinel. */
const ALL_CORPS_VALUE = '__all__';
/** Same reasoning as `ALL_CORPS_VALUE` — "any Group" needs a non-empty sentinel. `UNGROUPED_VALUE` (above) doubles as this filter's "no Group" option, same as the group column's Select. */
const ALL_GROUPS_VALUE = '__all_groups__';

/**
 * The filter bar, in the URL (ADR 0015) as one group: the bar hands back sort
 * and filters together, and the search box shares the group so a pending
 * keystroke flushes with a sort change instead of being dropped.
 */
const FILTER_PARAMS = {
  q: textParam(),
  sort: enumParam(SORT_KEYS, 'name'),
  dir: enumParam(SORT_DIRECTIONS, 'asc'),
  queue: optionalEnumParam(QUEUE_FILTER_STATES),
  corp: nullableTextParam(),
  group: nullableTextParam(),
  starred: boolParam(),
  alerts: boolParam(),
};

/** Everything behind the funnel — the search box stays out, it commits on its own. */
interface RosterFilter {
  sortKey: CharacterSortKey;
  sortDirection: SortDirection;
  queue: QueueState | null;
  corp: string | null;
  /** A group id, `UNGROUPED_VALUE` for "no group", or null for "any group". */
  group: string | null;
  starredOnly: boolean;
  alertsOnly: boolean;
}

/** Sort is left out: it reorders, it never hides anyone, so it isn't a "filter on". */
function activeRosterFilterCount(filter: RosterFilter): number {
  return [
    filter.queue !== null,
    filter.corp !== null,
    filter.group !== null,
    filter.starredOnly,
    filter.alertsOnly,
  ].filter(Boolean).length;
}

/**
 * Table view's header-click sort, over the whole roster in one flat table
 * (decision 20260927-071415 dropped the old one-`DataTable`-per-group-section
 * layout). Unsorted (the filter bar's order) by default.
 */
const TABLE_SORT = optionalSortParam();

interface CharacterCardProps {
  character: CharacterRecord;
  info: PublicInfoEntry | undefined;
  stats: CharacterSortStats | undefined;
  queue: QueueInfo | undefined;
  /** Whether this Character's `characterNotTraining` alert is on — false only for its one opt-out (issue #1731). */
  notTrainingAlertEnabled: boolean;
  groups: readonly CharacterGroup[];
  groupId: string | null;
  starred: boolean;
  isActive: boolean;
  alertCount: number;
  attention: AttentionEntry | undefined;
  /** One clock shared by every card (`useNow()` called once in `Characters`), not one interval per card — a large roster would otherwise re-render every card every tick regardless of whether it has anything counting down. */
  now: number;
  onSelect: (characterId: number) => void;
  onToggleStar: (characterId: number) => void;
  onMoveToGroup: (characterId: number, groupId: string | null) => void;
  onRemove: (characterId: number, name: string) => void;
}

type PiCardAttention = { kind: 'stopped' } | { kind: 'expiring'; expiryMs: number };

/** Card view's narrower PI signal (decision `20260925-230353`): only `idle`/`expiring-soon` reach a card, gated *before* `isPiExpired` — `decayed` also carries a real `piSoonestExpiryMs` and must stay table-only even once it's passed. */
function piCardAttention(
  attention: AttentionEntry | undefined,
  nowMs: number
): PiCardAttention | null {
  const piAttention = attention?.piAttention;
  if (piAttention !== 'idle' && piAttention !== 'expiring-soon') return null;
  if (piAttention === 'idle') return { kind: 'stopped' };
  const expiryMs = attention?.piSoonestExpiryMs;
  if (isPiExpired(expiryMs, nowMs)) return { kind: 'stopped' };
  return expiryMs != null ? { kind: 'expiring', expiryMs } : null;
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

/**
 * A corp or alliance name, plain: a roster row or card selects the Character,
 * so its Show Info links live in the selected Character's header (§6c).
 */
function AffiliationName({ name }: { name: string | null | undefined }) {
  const { t } = useTranslation();
  return <>{name || t('common.unknown')}</>;
}

function CharacterCard({
  character,
  info,
  stats,
  queue,
  notTrainingAlertEnabled,
  groups,
  groupId,
  starred,
  isActive,
  alertCount,
  attention,
  now,
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
  const piChip = piCardAttention(attention, now);

  return (
    <li
      aria-current={isActive ? 'true' : undefined}
      className={cx(
        'flex flex-col gap-2 rounded-xs border border-line p-3 backdrop-blur-sm hover:border-line-bright hover:bg-panel-2',
        interactiveClassName,
        isActive ? selectedRowClassName : 'bg-panel/85'
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-40 flex-1 items-start gap-3">
          {/* Pointer convenience: the name below is the keyboard and screen-reader
              control, so this avatar target stays out of both. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => onSelect(character.characterId)}
            className={cx('shrink-0 rounded-xs', interactiveClassName)}
          >
            <CharacterAvatar
              characterId={character.characterId}
              size="lg"
              loading="lazy"
              alt={t('characters.portraitAlt', { name: character.name })}
            />
          </button>
          <span className="min-w-0">
            {/* The dot rides the name's own line, not a corner of the card:
                it needs no room of its own, so the identity block loses
                nothing to make space for it. `min-w-0` on this row (not just
                the outer `span`) is what lets the name still truncate instead
                of pushing the dot off — and shrinking the name never touches
                the corp/alliance lines below, which are separate rows. */}
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
              <button
                type="button"
                aria-label={t('characters.select', { name: character.name })}
                data-character-select={character.characterId}
                onClick={() => onSelect(character.characterId)}
                className={cx(
                  'max-w-full truncate rounded-xs text-left text-sm font-semibold',
                  interactiveClassName,
                  focusRingClassName
                )}
              >
                {character.name}
              </button>
              {isActive && (
                <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-accent uppercase">
                  {t('characters.activeLabel')}
                </span>
              )}
              {lastSynced && (
                <DataAgeBadge date={lastSynced} dotOnly alwaysVisible className="shrink-0" />
              )}
            </span>
            <span className="block truncate text-xs text-text-dim">
              <AffiliationName name={info?.corporationName} />
            </span>
            <span className="block truncate text-xs text-text-dim">
              <AffiliationName name={info?.allianceName} />
            </span>
          </span>
        </div>
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
                data-group-select={character.characterId}
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
      <StatChips>
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
          value={
            stats?.wallet === undefined ? t('common.unknown') : <IskAmount value={stats.wallet} />
          }
        />
        {queue && (
          <StatChip
            label={t('characters.queueState')}
            tone={queueChipTone(queue.state, notTrainingAlertEnabled)}
            value={t(`characters.queueStates.${queue.state}`)}
          />
        )}
        {alertCount > 0 && (
          <StatChip label={t('characters.column.alerts')} tone="warning" value={alertCount} />
        )}
        {piChip && (
          <StatChip
            label={t('characters.column.pi')}
            tone="warning"
            value={
              piChip.kind === 'stopped'
                ? t('pi.attention.idle')
                : formatDuration((piChip.expiryMs - now) / 1000)
            }
          />
        )}
      </StatChips>
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
  const renameButton = useRef<HTMLButtonElement>(null);
  const focusAfterCommit = useFocusAfterCommit();

  // `returnFocus`: Enter and Escape remove the input, so focus goes back to
  // the Rename button; a blur means the user already went elsewhere.
  function commitRename(returnFocus: boolean) {
    setRenaming(false);
    if (returnFocus) focusAfterCommit(renameButton);
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
          onBlur={() => commitRename(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Focus moves to the Rename button below; without this the Enter's own
              // keypress would land on it and reopen the input.
              e.preventDefault();
              commitRename(true);
            }
            if (e.key === 'Escape') {
              setDraftName(group.name);
              setRenaming(false);
              focusAfterCommit(renameButton);
            }
          }}
          className="flex-1"
        />
      ) : (
        <h2
          data-group-heading={group.id}
          className="flex-1 truncate text-xs font-semibold tracking-widest text-text-dim uppercase focus:outline-none"
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
        data-move-group={`${group.id}:up`}
        onClick={() => onMove(index, -1)}
        disabled={index === 0}
      />
      <IconButton
        size="sm"
        icon={<Icon.Descending />}
        label={t('characters.moveGroupDown', { name: group.name })}
        data-move-group={`${group.id}:down`}
        onClick={() => onMove(index, 1)}
        disabled={index === groupCount - 1}
      />
      <IconButton
        size="sm"
        ref={renameButton}
        icon={<Icon.Rename />}
        label={`${t('characters.renameGroup')} ${group.name}`}
        onClick={() => setRenaming(true)}
      />
      <IconButton
        size="sm"
        icon={<Icon.Close />}
        tone="danger"
        label={`${t('characters.deleteGroup')} ${group.name}`}
        onClick={() => onRemove(group.id)}
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
  /** Whether this Character's `characterNotTraining` alert is on — false only for its one opt-out (issue #1731). */
  notTrainingAlertEnabled: boolean;
  attention: AttentionEntry | undefined;
  alertCount: number;
  /** From the same roster snapshot `stats` comes from — undefined until skills have loaded once. */
  jobSlotSkills: JobSlotSkills | undefined;
  /** Raw `total_sp` (not `correctedTotalSp`) — see `rosterView.ts`'s doc comment. */
  totalSp: number | undefined;
  starred: boolean;
  /** Null when ungrouped — same as the card's `groupId` prop. */
  groupId: string | null;
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
    align: 'right',
    className: 'tabular-nums',
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
      // Red when every slot sits idle (0/5 used → nothing queued, go fill
      // them), fading to plain text as slots fill up — the number is a
      // call to action, not a health check, so more open reads as more
      // urgent, not less.
      const tone = open === max ? 'text-danger' : open / max >= 0.5 ? 'text-warning' : 'text-text';
      return (
        <HintText
          content={t('characters.openJobsTooltip', { used: running, max })}
          className={tone}
        >
          {open}
        </HintText>
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
  extractionNet: number | null,
  onToggleStarred: (characterId: number) => void,
  timeZone: 'UTC' | undefined,
  groups: readonly CharacterGroup[],
  onMoveToGroup: (characterId: number, groupId: string | null) => void
): Record<CharacterColumnId, DataTableColumn<CharacterRow>> {
  return {
    name: {
      id: 'name',
      header: t('characters.column.name'),
      primary: true,
      stickyStart: true,
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
      render: (row) => <AffiliationName name={row.info?.corporationName} />,
    },
    // Same Select the card view's group control renders (issue #2077) — a
    // visible, Tab-reachable move-to-group in table view, no context-menu
    // twin needed. Only offered when `groups.length > 0` (gated in
    // `availableCharacterColumns`), so `groups` here is never empty in
    // practice, but the map still runs off the live list rather than a
    // snapshot so a group renamed mid-session updates every row's dropdown.
    group: {
      id: 'group',
      header: t('characters.column.group'),
      sortValue: (row) =>
        row.groupId ? (groups.find((group) => group.id === row.groupId)?.name ?? '') : undefined,
      render: (row) => (
        <Select
          value={row.groupId ?? UNGROUPED_VALUE}
          onValueChange={(value) =>
            onMoveToGroup(row.character.characterId, value === UNGROUPED_VALUE ? null : value)
          }
        >
          <SelectTrigger
            size="sm"
            aria-label={t('characters.groupFor', { name: row.character.name })}
            data-group-select={row.character.characterId}
            className="w-32"
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
      ),
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
        row.stats?.wallet === undefined ? (
          t('common.unknown')
        ) : (
          <IskAmount value={row.stats.wallet} />
        ),
    },
    lastSynced: {
      id: 'lastSynced',
      header: t('characters.column.lastSynced'),
      sortValue: (row) => characterLastSynced(row.stats, row.queue)?.getTime(),
      render: (row) => {
        const age = characterLastSynced(row.stats, row.queue);
        return age ? <DataAgeBadge date={age} alwaysVisible /> : t('common.unknown');
      },
    },
    training: {
      id: 'training',
      header: t('characters.column.training'),
      sortValue: (row) =>
        row.queue ? queueChipRank(row.queue.state, row.notTrainingAlertEnabled) : undefined,
      render: (row) => {
        if (!row.queue) return '—';
        const tone =
          STAT_CHIP_TONE_TEXT_CLASS[queueChipTone(row.queue.state, row.notTrainingAlertEnabled)];
        // Only `training`/`endingSoon` carry a finish time — paused/idle/
        // unknown have nothing to count down to, so they keep the plain
        // state label they've always shown.
        if (row.queue.trainingFinishMs === null) {
          return <span className={tone}>{t(`characters.queueStates.${row.queue.state}`)}</span>;
        }
        return (
          <HintText
            content={formatTimestamp(new Date(row.queue.trainingFinishMs), timeZone)}
            className={tone}
          >
            {formatCountdown((row.queue.trainingFinishMs - Date.now()) / 1000)}
          </HintText>
        );
      },
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
      render: (row) => {
        const attention = row.attention?.piAttention;
        if (attention === undefined) return '—';
        const expiryMs = row.attention?.piSoonestExpiryMs;
        if (expiryMs != null && isPiExpired(expiryMs, Date.now())) {
          const stoppedTone = STAT_CHIP_TONE_TEXT_CLASS[PI_ATTENTION_TONE.idle];
          return (
            <HintText
              content={formatTimestamp(new Date(expiryMs), timeZone)}
              className={stoppedTone}
            >
              {t('pi.attention.idle')}
            </HintText>
          );
        }
        const tone = STAT_CHIP_TONE_TEXT_CLASS[PI_ATTENTION_TONE[attention]];
        // Some attention states have nothing currently extracting to count
        // down to (e.g. `decayed` with no program running at all) — those
        // keep the categorical label; anything with a real, future expiry
        // gets the countdown instead, which is strictly more useful.
        if (expiryMs == null) {
          return <span className={tone}>{t(`pi.attention.${attention}`)}</span>;
        }
        const label = formatDuration((expiryMs - Date.now()) / 1000);
        return (
          <HintText content={formatTimestamp(new Date(expiryMs), timeZone)} className={tone}>
            {/* The countdown alone is a colour-only tell of the underlying
                  attention state (DESIGN.md §7) — colour-blind sighted readers
                  need the word too, not just screen readers, so it prints
                  rather than hiding in an sr-only span. */}
            {t(`pi.attention.${attention}`)} · {label}
          </HintText>
        );
      },
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
          <span className={STAT_CHIP_TONE_TEXT_CLASS.success}>
            {t('characters.spReadyYes')}
            {extractionNet !== null && (
              <>
                {' · '}
                <IskAmount value={extractionTotalIsk(row.totalSp, extractionNet) ?? 0} />
              </>
            )}
          </span>
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
      render: (row) => (
        <IconButton
          size="sm"
          icon={<Icon.Pin weight={row.starred ? 'fill' : 'light'} />}
          label={t(row.starred ? 'characters.unstar' : 'characters.star', {
            name: row.character.name,
          })}
          pressed={row.starred}
          onClick={() => onToggleStarred(row.character.characterId)}
        />
      ),
    },
  };
}

/** Character wall: pick the active character, group/sort/densify it, or add another via EVE SSO. */
export function Characters() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const characters = useLiveQuery(() => db.characters.orderBy('characterId').toArray());
  const publicInfo = usePublicInfo((state) => state.byCharacterId);
  const loadPublicInfoMany = usePublicInfo((state) => state.loadMany);
  const setActiveCharacter = useActiveCharacter((state) => state.setActiveCharacter);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const now = useNow();

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
  const visibleColumnsHydrated = useVisibleCharacterColumns((state) => state.hydrated);

  const columnsMigrated = useCharacterColumnsMigrated((state) => state.value);
  const columnsMigratedHydrated = useCharacterColumnsMigrated((state) => state.hydrated);
  const hydrateColumnsMigrated = useCharacterColumnsMigrated((state) => state.hydrate);
  const setColumnsMigrated = useCharacterColumnsMigrated((state) => state.setValue);

  const spExtractionEnabled = useSpExtractionMonitoringEnabled((state) => state.value);
  const hydrateSpExtractionEnabled = useSpExtractionMonitoringEnabled((state) => state.hydrate);
  const spExtractionThreshold = useSpExtractionThresholdSp((state) => state.value);
  const hydrateSpExtractionThreshold = useSpExtractionThresholdSp((state) => state.hydrate);

  const extractionPrices = useExtractionPrices();
  const alertCounts = useAlertCountsByCharacter();
  const notificationPrefs = useNotificationPreferences((state) => state.value);
  const notTrainingAlertEnabledFor = (characterId: number) =>
    isNotTrainingAlertEnabledFor(notificationPrefs, characterId);
  const timeZone = useTimeZone();

  const [filterParams, setFilterParams] = useUrlParams(FILTER_PARAMS);
  const { q: search, sort: sortKey, dir: sortDirection } = filterParams;
  const rosterFilter: RosterFilter = {
    sortKey,
    sortDirection,
    queue: filterParams.queue,
    corp: filterParams.corp,
    group: filterParams.group,
    starredOnly: filterParams.starred,
    alertsOnly: filterParams.alerts,
  };
  const [tableSortParam, setTableSort] = useUrlParam('table.sort', TABLE_SORT);
  const [rosterCore, setRosterCore] = useState<Map<number, RosterCore>>(new Map());
  const [attentionById, setAttentionById] = useState<Map<number, AttentionEntry>>(new Map());

  /** The one place a fresh roster snapshot becomes `rosterCore` — shared by the cache-only load effect and "Refresh all" so a future added field only needs adding to `rosterView.ts`'s `RosterCore`. */
  function applyRoster(roster: readonly RosterEntry[], now: number) {
    setRosterCore(rosterCoreMap(roster, now));
  }

  /** `applyRoster` for one character that just finished refreshing: merges into `rosterCore` rather than replacing it, so the rest of the roster keeps its rows. */
  function mergeRosterEntry(entry: RosterEntry, now: number) {
    setRosterCore((previous) => mergeRosterCore(previous, entry, now));
  }

  const [addingGroup, setAddingGroup] = useState(false);
  const newGroupButton = useRef<HTMLButtonElement>(null);
  const focusAfterCommit = useFocusAfterCommit();
  const [newGroupName, setNewGroupName] = useState('');
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [removingCharacter, setRemovingCharacter] = useState<{
    id: number;
    name: string;
  } | null>(null);
  /** The Character whose removal just failed — rolled back whole, so it is still listed. */
  const [removeFailedName, setRemoveFailedName] = useState<string | null>(null);
  useEffect(() => {
    if (removeFailedName === null) return;
    const timer = setTimeout(() => setRemoveFailedName(null), 5000);
    return () => clearTimeout(timer);
  }, [removeFailedName]);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [customizingPermissions, setCustomizingPermissions] = useState(false);

  const charactersById = useMemo(
    () => new Map((characters ?? []).map((character) => [character.characterId, character])),
    [characters]
  );

  // Not `useMemo`: `handleToggleStar` below closes over `starred`/`setStarred`
  // and is a fresh function every render anyway, so a memoized wrapper here
  // would just recompute every render regardless — `buildColumns` itself is
  // cheap (a handful of object literals, no per-character work).
  const columnsById = buildColumns(
    t,
    spExtractionThreshold,
    extractionPrices.net,
    (id) => void handleToggleStar(id),
    timeZone,
    groupsValue.groups,
    (id, groupId) => void handleMoveToGroup(id, groupId)
  );
  const availableColumnIds = availableCharacterColumns(
    spExtractionEnabled,
    groupsValue.groups.length > 0
  );
  // `id` is already known available here, so this is just "is it checked" —
  // `visibleAvailableColumns` (below, `handleToggleColumn`'s own zero-columns
  // guard) is for narrowing the *raw stored* list, which can hold ids that
  // aren't available right now; this list already excludes those.
  const activeColumnIds = availableColumnIds.filter((id) => visibleColumns.includes(id));

  // A sort on a column that isn't on screen (hand-edited link, or since
  // hidden in the Columns picker) reads as unsorted.
  const tableSort =
    tableSortParam && (activeColumnIds as readonly string[]).includes(tableSortParam.columnId)
      ? tableSortParam
      : null;

  const query = search.trim().toLowerCase();
  const narrowing = query.length > 0 || activeRosterFilterCount(rosterFilter) > 0;
  /** Search and funnel filters as one test, so card view, table view and the "nothing matches" state can't disagree. */
  function matchesFilters(characterId: number): boolean {
    const corpName = publicInfo[characterId]?.corporationName ?? '';
    if (query) {
      const character = charactersById.get(characterId);
      const hit =
        (character?.name.toLowerCase().includes(query) ?? false) ||
        corpName.toLowerCase().includes(query);
      if (!hit) return false;
    }
    if (
      rosterFilter.queue !== null &&
      rosterCore.get(characterId)?.queue.state !== rosterFilter.queue
    ) {
      return false;
    }
    if (rosterFilter.corp !== null && corpName !== rosterFilter.corp) return false;
    if (rosterFilter.group !== null) {
      const characterGroupId = groupIdByCharacterId.get(characterId) ?? null;
      if (rosterFilter.group === UNGROUPED_VALUE) {
        if (characterGroupId !== null) return false;
      } else if (characterGroupId !== rosterFilter.group) {
        return false;
      }
    }
    if (rosterFilter.starredOnly && !isCharacterStarred(starred, characterId)) return false;
    if (rosterFilter.alertsOnly && (alertCounts.get(characterId) ?? 0) === 0) return false;
    return true;
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
    void hydrateColumnsMigrated();
  }, [hydrateColumnsMigrated]);

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
    void hydrateSpExtractionEnabled();
  }, [hydrateSpExtractionEnabled]);

  useEffect(() => {
    void hydrateSpExtractionThreshold();
  }, [hydrateSpExtractionThreshold]);

  useEffect(() => {
    // One batched call for the whole roster (issue: /characters page N+1 ESI
    // calls) rather than one `load` per character — see `loadMany`'s doc
    // comment on `usePublicInfo`.
    if (characters && characters.length > 0) {
      void loadPublicInfoMany(characters.map((character) => character.characterId));
    }
  }, [characters, loadPublicInfoMany]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!characters || characters.length === 0) {
        if (!cancelled) setRosterCore(new Map());
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

  const groupIdByCharacterId = new Map<number, string>();
  for (const group of groupsValue.groups) {
    for (const characterId of group.characterIds) groupIdByCharacterId.set(characterId, group.id);
  }

  /**
   * `rosterCore`'s own `stats` (`rosterCoreMap`) plus the two fields it can't
   * carry itself — group name and alert count both live in stores outside
   * `groups.ts`'s Dexie-free scope (`groups.ts`'s `CharacterSortStats`
   * doc comment). Built here, not in `rosterCore` state, so `applyRoster`/
   * `mergeRosterEntry` stay a pure roster-snapshot mirror; this just layers
   * the two extra keys on top for `sortCharacterIds` to read when `sortKey`
   * is `'group'`/`'alerts'`.
   *
   * Not `useMemo`: its only stable-looking input, `groupIdByCharacterId`, is
   * a `Map` — the React Compiler lint (`react-hooks/preserve-manual-
   * memoization`) can't prove a `Map` dependency is never mutated in place,
   * so it refuses to trust this memo (and, transitively, the one that builds
   * `groupIdByCharacterId`). `renderTable`/`renderCardList` already rebuild
   * their `CharacterRow[]` unmemoized every render for the same roster-sized
   * data, so recomputing this map alongside them costs nothing extra.
   */
  const sortStatsById = new Map<number, CharacterSortStats>();
  for (const [characterId, core] of rosterCore) {
    const base = core.stats;
    const groupId = groupIdByCharacterId.get(characterId);
    const groupName = groupId
      ? groupsValue.groups.find((group) => group.id === groupId)?.name
      : undefined;
    sortStatsById.set(characterId, {
      ...base,
      groupName,
      alertCount: alertCounts.get(characterId) ?? 0,
    });
  }

  async function select(characterId: number) {
    await setActiveCharacter(characterId);
    // Return to wherever the switch started (the tab bar, or the More
    // sheet's portrait+name row) — falling back to Overview when there is
    // nowhere to return to (a fresh load) or the origin was this page itself
    // (#1764).
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from && from !== '/characters' ? from : '/overview');
  }

  /**
   * Live pull for every character, capped-speed — same "cache-first, one
   * explicit button for live" rule the PI alt-colonies view already follows,
   * rather than a new pattern for this page.
   */
  async function handleRefreshAll() {
    // `aria-disabled` keeps the button hoverable so its Tooltip stays readable
    // mid-refresh, but it still takes the click — so the guard lives here.
    if (refreshingAll) return;
    setRefreshingAll(true);
    try {
      const now = Date.now();
      const [roster, attention] = await Promise.all([
        loadRosterSnapshot({ live: true, now, onEntry: (entry) => mergeRosterEntry(entry, now) }),
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
    if (
      visibleAvailableColumns(next, spExtractionEnabled, groupsValue.groups.length > 0).length === 0
    )
      return;
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
    // Neighbours are read now: the removed card is gone from the DOM afterwards.
    const ids = Array.from(
      document.querySelectorAll<HTMLElement>('[data-character-select]'),
      (el) => el.dataset.characterSelect
    );
    const at = ids.indexOf(String(id));
    const cardButton = (cardId: string | undefined) => () =>
      cardId ? document.querySelector<HTMLElement>(`[data-character-select="${cardId}"]`) : null;
    setRemovingCharacter(null);
    try {
      await removeCharacterAfterSync(id, isSyncConfigured());
      useAuthFailure.getState().dismissNeedsLogin(id);
      // The dialog has closed by now, so this isn't overridden by its focus return.
      focusAfterCommit(
        cardButton(at >= 0 ? ids[at + 1] : undefined),
        cardButton(at > 0 ? ids[at - 1] : undefined),
        () => document.querySelector<HTMLElement>('h1')
      );
    } catch {
      // The local removal is one transaction, so a failure left every row in
      // place — say so rather than leave the click looking ignored.
      setRemoveFailedName(name);
    }
  }

  async function handleMoveToGroup(characterId: number, groupId: string | null) {
    await setGroupsValue(
      updateGroups(
        groupsValue,
        (groups) => moveCharacterToGroup(groups, characterId, groupId),
        // eslint-disable-next-line react-hooks/purity -- fires from a click (the group Select's onValueChange, reached through buildColumns' column-object indirection, same handler CharacterCard's own group Select already calls directly), never during render itself.
        Date.now()
      )
    );
    // The card remounts under its new group, so the Select that ran this is gone.
    focusAfterCommit(() =>
      document.querySelector<HTMLElement>(`[data-group-select="${characterId}"]`)
    );
  }

  /** `returnFocus` is false on blur: the user already went elsewhere. */
  async function handleCreateGroup(returnFocus: boolean) {
    const name = newGroupName.trim();
    setAddingGroup(false);
    setNewGroupName('');
    if (returnFocus) focusAfterCommit(newGroupButton);
    if (!name) return;
    const group: CharacterGroup = { id: crypto.randomUUID(), name, characterIds: [] };
    if (returnFocus) {
      focusAfterCommit(() =>
        document.querySelector<HTMLElement>(`[data-group-heading="${group.id}"]`)
      );
    }
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
    const at = groupsValue.groups.findIndex((group) => group.id === groupId);
    const nextId = groupsValue.groups[at + 1]?.id;
    setDeletingGroupId(null);
    await setGroupsValue(
      updateGroups(groupsValue, (groups) => removeGroup(groups, groupId), Date.now())
    );
    focusAfterCommit(
      () => document.querySelector<HTMLElement>(`[data-group-heading="${nextId}"]`),
      () => document.querySelector<HTMLElement>('[data-ungrouped-heading]'),
      newGroupButton
    );
  }

  async function handleMoveGroup(index: number, direction: -1 | 1) {
    const groupId = groupsValue.groups[index]?.id;
    await setGroupsValue(
      updateGroups(
        groupsValue,
        (groups) => reorderGroups(groups, index, index + direction),
        Date.now()
      )
    );
    // At the top or bottom the pressed button turns disabled; the sibling takes focus.
    const enabledMove = (side: 'up' | 'down') => () => {
      const el = document.querySelector<HTMLButtonElement>(
        `[data-move-group="${groupId}:${side}"]`
      );
      return el && !el.disabled ? el : null;
    };
    const [same, other] = direction === -1 ? (['up', 'down'] as const) : (['down', 'up'] as const);
    focusAfterCommit(enabledMove(same), enabledMove(other));
  }

  /** Card view only — called once per group section plus once for Ungrouped, same as before (decision 20260927-071415 keeps group sectioning card-view-only). */
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
              info={publicInfo[characterId]}
              stats={rosterCore.get(characterId)?.stats}
              queue={rosterCore.get(characterId)?.queue}
              notTrainingAlertEnabled={notTrainingAlertEnabledFor(characterId)}
              groups={groupsValue.groups}
              groupId={groupIdByCharacterId.get(characterId) ?? null}
              starred={isCharacterStarred(starred, characterId)}
              isActive={activeCharacterId === characterId}
              alertCount={alertCounts.get(characterId) ?? 0}
              attention={attentionById.get(characterId)}
              now={now}
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

  /**
   * The table's rows: the whole (filtered) roster, in the roster sort. Built
   * up here, not inside `renderTable`, because the export hook below needs
   * them before the loading early return — which also lets card view export
   * the same rows (the DataTable's own column sort applies only while it's
   * mounted).
   */
  const tableRows: CharacterRow[] = partitionStarredFirst(
    sortCharacterIds(
      (characters ?? [])
        .map((character) => character.characterId)
        .filter((characterId) => matchesFilters(characterId)),
      sortStatsById,
      sortKey,
      sortDirection
    ),
    starred
  )
    .map((characterId) => charactersById.get(characterId))
    .filter((character): character is CharacterRecord => character !== undefined)
    .map((character) => {
      const core = rosterCore.get(character.characterId);
      return {
        character,
        info: publicInfo[character.characterId],
        stats: core?.stats,
        queue: core?.queue,
        notTrainingAlertEnabled: notTrainingAlertEnabledFor(character.characterId),
        attention: attentionById.get(character.characterId),
        alertCount: alertCounts.get(character.characterId) ?? 0,
        jobSlotSkills: core?.jobSlotSkills,
        totalSp: core?.totalSp,
        starred: isCharacterStarred(starred, character.characterId),
        groupId: groupIdByCharacterId.get(character.characterId) ?? null,
      };
    });
  const groupList = groupsValue.groups;
  const csvColumns = useMemo(
    () =>
      charactersCsvColumns(t, {
        groupNameById: new Map(groupList.map((group) => [group.id, group.name])),
        spExtractionEnabled,
        spExtractionThresholdSp: spExtractionThreshold,
        lastSynced: (row) => characterLastSynced(row.stats, row.queue),
      }),
    [t, groupList, spExtractionEnabled, spExtractionThreshold]
  );
  const charactersExport = useTableExport({
    surface: 'characters',
    rows: tableRows,
    columns: csvColumns,
  });

  /**
   * Table view — one flat `DataTable` over the whole (filtered) roster, not
   * one per group section (decision 20260927-071415): the new `group` column
   * carries membership per row instead, and `GroupSectionHeader`'s
   * rename/reorder/delete stay card-view only.
   */
  const extractorsReady = tableRows.reduce(
    (sum, row) =>
      row.totalSp !== undefined && isSpExtractionReady(row.totalSp, spExtractionThreshold)
        ? sum + extractorCount(row.totalSp)
        : sum,
    0
  );
  const extractionSummary =
    !spExtractionEnabled || !extractionPrices.loaded || extractorsReady === 0
      ? null
      : extractionPrices.net === null
        ? t('characters.extractionUnpriced', { hub: extractionPrices.hubName })
        : t('characters.extractionTotal', {
            isk: formatIskCompact(extractionPrices.net * extractorsReady),
            each: formatIskCompact(extractionPrices.net),
            hub: extractionPrices.hubName,
          });

  function renderTable(rows: readonly CharacterRow[]) {
    return (
      // Deliberate deviation from DataTable's usual `.dt-stack` collapse on
      // mobile (docs/context/decisions/20260909-130638-characters-table-
      // view-mobile-scroll-roster-overview-split.md): a real, comparable
      // table stays a table, and scrolls sideways instead, at every width.
      <div className="overflow-x-auto">
        {extractionSummary && (
          <p className="mb-2 text-[0.6875rem] text-text-dim">{extractionSummary}</p>
        )}
        <DataTable
          {...charactersExport.tableProps}
          columns={activeColumnIds.map((id) => columnsById[id])}
          rows={rows}
          rowKey={(row) => row.character.characterId}
          label={t('characters.title')}
          responsive="table"
          sort={tableSort}
          onSortChange={setTableSort}
          onRowClick={(row) => void select(row.character.characterId)}
          rowMoreActions
          rowContextMenu={(row, tr) => (
            <CharacterRowContextMenu
              characterId={row.character.characterId}
              name={row.character.name}
              onRemove={() => requestRemoveCharacter(row.character.characterId, row.character.name)}
            >
              {tr}
            </CharacterRowContextMenu>
          )}
        />
      </div>
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
  const noMatches = narrowing && !allIds.some((id) => matchesFilters(id));
  // Only corps the roster actually has, plus a pasted-link value that isn't
  // one of them — dropping it would blank the trigger while the badge still
  // counts it, a filter the pilot can neither see nor clear.
  const corpOptions = [
    ...new Set(
      [
        ...allIds.map((id) => publicInfo[id]?.corporationName),
        rosterFilter.corp ?? undefined,
      ].filter((name): name is string => !!name)
    ),
  ].sort((a, b) => a.localeCompare(b));
  // Same "keep a stale selection visible so it can be cleared" reasoning as
  // `corpOptions` — a group filtered on, then deleted, would otherwise blank
  // the Select's trigger while the filter chip count still counts it.
  const groupFilterOptions =
    rosterFilter.group !== null &&
    rosterFilter.group !== UNGROUPED_VALUE &&
    !groupsValue.groups.some((group) => group.id === rosterFilter.group)
      ? [
          ...groupsValue.groups,
          { id: rosterFilter.group, name: rosterFilter.group, characterIds: [] },
        ]
      : groupsValue.groups;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title={t('characters.title')}
        actions={
          <>
            {/*
              `Tooltip`, not a native `title=`: a touch device has no hover, so
              the "may take a moment" warning was unreachable on a phone exactly
              where the wait is longest (#1102). The tap belongs to the refresh,
              so no `openOnTap` — touch-and-hold reads it. And `aria-disabled`
              rather than the native attribute while refreshing, per DESIGN.md's
              `FilterChip` rule: a natively disabled button takes no hover and no
              focus, which would make the bubble unreadable by either route just
              as the wait it explains is actually happening.
            */}
            {characters.length > 0 && (
              <IconButton
                label={refreshingAll ? t('characters.refreshingAll') : t('characters.refreshAll')}
                tooltip={`${t('characters.refreshAll')}. ${t('characters.refreshAllHint')}`}
                icon={refreshingAll ? <Spinner size="sm" /> : <Icon.Refresh />}
                onClick={() => void handleRefreshAll()}
                aria-disabled={refreshingAll || undefined}
                className="aria-disabled:cursor-default aria-disabled:opacity-40"
              />
            )}
            {/*
              The add-a-character branch, not a re-auth: SSO decides who comes
              back, so unioning with the *active* Character's grant would ask
              the newcomer to consent to scopes aimed at somebody else (#295).
              The arrow reuses the login page's own Customize dialog, so
              adding several alts with one hand-picked grant stays one click each.
            */}
            <div className="flex">
              <Tooltip content={t('characters.add')}>
                <Button
                  variant="primary"
                  size="md"
                  className="rounded-r-none"
                  aria-label={t('characters.add')}
                  onClick={() => void beginAddCharacterLogin()}
                >
                  <Icon.AddCharacter />
                  {/* Icon-only below `sm`: no room beside the split trigger. */}
                  <span className="hidden sm:inline">{t('characters.addLabel')}</span>
                </Button>
              </Tooltip>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="primary"
                    size="md"
                    className="rounded-l-none border-l-accent-contrast/30 px-1!"
                    aria-label={t('characters.addMenuLabel')}
                  >
                    <Icon.Expanded aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setCustomizingPermissions(true)}>
                    {t('characters.addWithPermissions')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        }
      />

      <NeedsLoginNotice />

      {characters.length === 0 ? (
        <EmptyState title={t('characters.emptyTitle')} hint={t('characters.emptyHint')} />
      ) : (
        <>
          <FilterBar
            value={rosterFilter}
            onChange={(next) =>
              setFilterParams({
                sort: next.sortKey,
                dir: next.sortDirection,
                queue: next.queue,
                corp: next.corp,
                group: next.group,
                starred: next.starredOnly,
                alerts: next.alertsOnly,
              })
            }
            activeCount={activeRosterFilterCount(rosterFilter)}
            search={
              <SearchInput
                value={search}
                onChange={(e) => setFilterParams({ q: e.target.value })}
                placeholder={t('characters.searchPlaceholder')}
                className="min-w-40 flex-1"
              />
            }
            // Card view has no columns to pick or table to export, so these
            // only exist alongside the table they act on.
            actions={
              viewMode === 'table' ? (
                <>
                  <ColumnPickerMenu
                    available={availableColumnIds}
                    visible={activeColumnIds}
                    columnsById={columnsById}
                    onToggle={handleToggleColumn}
                    buttonLabel={t('characters.columnsButton')}
                    menuTitle={t('characters.columnsMenuTitle')}
                  />
                  <TableActionsMenu
                    name={t('characters.title')}
                    tableExport={charactersExport}
                    size="md"
                  />
                </>
              ) : undefined
            }
          >
            {(draft, setDraft) => (
              <>
                <div
                  role="group"
                  aria-label={t('characters.filterQueueLabel')}
                  className="flex flex-wrap gap-2"
                >
                  {QUEUE_FILTER_STATES.map((state) => (
                    <FilterChip
                      key={state}
                      label={t(`characters.queueStates.${state}`)}
                      selected={draft.queue === state}
                      onToggle={() =>
                        setDraft({ ...draft, queue: draft.queue === state ? null : state })
                      }
                    />
                  ))}
                </div>
                {/* One corp has nothing to narrow to — unless a link already set one, which must stay visible to be cleared. */}
                {(corpOptions.length > 1 || draft.corp !== null) && (
                  <FilterField label={t('characters.filterCorpLabel')}>
                    <Select
                      value={draft.corp ?? ALL_CORPS_VALUE}
                      onValueChange={(value) =>
                        setDraft({ ...draft, corp: value === ALL_CORPS_VALUE ? null : value })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={t('characters.filterCorpLabel')}
                        className="w-48"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_CORPS_VALUE}>
                          {t('characters.allCorporations')}
                        </SelectItem>
                        {corpOptions.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>
                )}
                {/* No Groups yet has nothing to narrow to — same gate as the corp filter above. */}
                {groupsValue.groups.length > 0 && (
                  <FilterField label={t('characters.filterGroupLabel')}>
                    <Select
                      value={draft.group ?? ALL_GROUPS_VALUE}
                      onValueChange={(value) =>
                        setDraft({ ...draft, group: value === ALL_GROUPS_VALUE ? null : value })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={t('characters.filterGroupLabel')}
                        className="w-48"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_GROUPS_VALUE}>
                          {t('characters.allGroups')}
                        </SelectItem>
                        <SelectItem value={UNGROUPED_VALUE}>{t('characters.ungrouped')}</SelectItem>
                        {groupFilterOptions.map((group) => (
                          <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>
                )}
                <FilterChip
                  label={t('characters.filterStarredOnly')}
                  selected={draft.starredOnly}
                  onToggle={() => setDraft({ ...draft, starredOnly: !draft.starredOnly })}
                />
                <FilterChip
                  label={t('characters.filterHasAlerts')}
                  selected={draft.alertsOnly}
                  onToggle={() => setDraft({ ...draft, alertsOnly: !draft.alertsOnly })}
                />
                <FilterField label={t('characters.sortBy')}>
                  <Select
                    value={draft.sortKey}
                    onValueChange={(value) =>
                      setDraft({ ...draft, sortKey: value as CharacterSortKey })
                    }
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
                </FilterField>
                <FilterField label={t('characters.sortDirection')} stretch={false}>
                  <IconButton
                    size="sm"
                    icon={draft.sortDirection === 'asc' ? <Icon.Ascending /> : <Icon.Descending />}
                    label={t(
                      draft.sortDirection === 'asc'
                        ? 'characters.sortDirectionAsc'
                        : 'characters.sortDirectionDesc'
                    )}
                    tooltip={t('characters.sortDirection')}
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
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleCreateGroup(true);
                    }
                    if (e.key === 'Escape') {
                      setNewGroupName('');
                      setAddingGroup(false);
                      focusAfterCommit(newGroupButton);
                    }
                  }}
                  onBlur={() => void handleCreateGroup(false)}
                  className="w-40"
                />
              ) : (
                <Button ref={newGroupButton} size="md" onClick={() => setAddingGroup(true)}>
                  {t('characters.newGroup')}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Shared app-wide text-size control (`useFontScale`), also on Settings' Display
                  tab — relabeled Compact/Cozy/Comfortable/Spacious here, but changing it here
                  changes text size everywhere. */}
              <Select
                value={String(density)}
                onValueChange={(value) => void setDensity(Number(value) as FontScale)}
              >
                <SelectTrigger size="sm" aria-label={t('characters.densityLabel')} className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_SCALE_STEPS.map((step) => (
                    <SelectItem key={step} value={String(step)}>
                      {t(DENSITY_LABEL_KEYS[step])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div role="group" aria-label={t('characters.viewModeLabel')} className="flex gap-2">
                <IconButton
                  size="sm"
                  icon={<Icon.CardsView />}
                  label={t('characters.viewCards')}
                  pressed={viewMode === 'card'}
                  onClick={() => void setViewMode('card')}
                />
                <IconButton
                  size="sm"
                  icon={<Icon.TableView />}
                  label={t('characters.viewTable')}
                  pressed={viewMode === 'table'}
                  onClick={() => void setViewMode('table')}
                />
              </div>
            </div>
          </div>

          {noMatches ? (
            <EmptyState
              title={t('characters.noSearchMatches')}
              hint={t('characters.noSearchMatchesHint')}
            />
          ) : viewMode === 'table' ? (
            // One flat table over the whole roster, not one per group section
            // (decision 20260927-071415) — the `group` column carries
            // membership per row, and group management stays in card view.
            renderTable(tableRows)
          ) : (
            <div className="space-y-4">
              {groupsValue.groups.map((group, index) => (
                <section key={group.id} className="space-y-2">
                  <GroupSectionHeader
                    group={group}
                    index={index}
                    groupCount={groupsValue.groups.length}
                    onRename={(id, name) => void handleRenameGroup(id, name)}
                    onRemove={(id) => setDeletingGroupId(id)}
                    onMove={(index2, direction) => void handleMoveGroup(index2, direction)}
                  />
                  {group.characterIds.length === 0 ? (
                    <p className="text-xs text-text-dim">{t('characters.emptyGroup')}</p>
                  ) : (
                    renderCardList(group.characterIds)
                  )}
                </section>
              ))}

              {(groupsValue.groups.length === 0 || ungroupedIds.length > 0) && (
                <section className="space-y-2">
                  {groupsValue.groups.length > 0 && (
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
          )}
        </>
      )}

      {removeFailedName !== null && (
        <Toast message={t('characters.removeFailed', { name: removeFailedName })} />
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
        open={deletingGroupId !== null}
        onClose={() => setDeletingGroupId(null)}
        title={t('characters.deleteGroup')}
      >
        <p className="text-xs text-text-dim">{t('characters.deleteGroupConfirm')}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={() => setDeletingGroupId(null)}>
            {t('characters.cancel')}
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => deletingGroupId && void handleRemoveGroup(deletingGroupId)}
          >
            {t('characters.deleteGroup')}
          </Button>
        </div>
      </Modal>

      <CustomizePermissionsDialog
        open={customizingPermissions}
        onClose={() => setCustomizingPermissions(false)}
        title={t('characters.customizePermissionsTitle')}
      />
    </div>
  );
}
