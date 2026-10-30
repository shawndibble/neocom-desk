import { HintText } from '@/components/ui/HintText';
import { type CharacterRecord } from '@/db';
import {
  CharacterAvatar,
  DataAgeBadge,
  IconButton,
  IskAmount,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  STAT_CHIP_TONE_TEXT_CLASS,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { type QueueInfo } from '@/features/character/rosterView';
import { isPiExpired, type AttentionEntry } from '@/features/character/rosterAttention';
import { extractionTotalIsk, isSpExtractionReady } from '@/engine/skills/spExtraction';
import { maxJobSlots, type JobSlotCategory, type JobSlotSkills } from '@/engine/industry/jobSlots';
import { type CharacterColumnId } from '@/features/character/characterColumns';
import { ATTENTION_RANK, ATTENTION_TONE as PI_ATTENTION_TONE } from '@/engine/pi/colonyStatus';
import { formatCountdown, formatDuration } from '@/lib/duration';
import { formatTimestamp } from '@/lib/timestamp';
import {
  placeLabel,
  placeSortText,
  type CharacterWhereabouts,
} from '@/features/character/characterWhereabouts';
import { type CharacterGroup, type CharacterSortStats } from '@/features/character/groups';
import { formatCompactNumber } from '@/lib/compactNumber';
import { AffiliationName } from '@/features/character/CharacterCard';
import { achievementColumn } from '@/features/character/achievementColumn';
import type { AchievementLookup } from '@/features/character/useCharacterAchievements';
import {
  UNGROUPED_VALUE,
  characterLastSynced,
  queueChipRank,
  queueChipTone,
} from '@/features/character/rosterQueueChip';

/** One character's table row — everything a column might render, gathered once per character rather than re-derived per cell. */
export interface CharacterRow {
  character: CharacterRecord;
  corporationName: string | undefined;
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
  /** Undefined until read (and never read while neither column shows). */
  whereabouts: CharacterWhereabouts | undefined;
  /** False when the stored grant lacks the scope: the cell says which Permission, not "unknown". */
  locationGranted: boolean;
  shipGranted: boolean;
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

/** A dash that names the Permission this Character has not granted. */
function missingPermission(
  name: string,
  permission: 'characterDetails' | 'currentShip',
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return (
    <HintText
      content={t('characters.needsPermission', {
        name,
        permission: t(`permissions.${permission}.label`),
      })}
    >
      —
    </HintText>
  );
}

/**
 * Every column the table can show, keyed by id — the picker offers a subset
 * of these keys, and the table renders whichever the pilot has checked, in
 * this record's own order (not the order they were picked in).
 */
export function buildColumns(
  t: (key: string, options?: Record<string, unknown>) => string,
  spExtractionThresholdSp: number,
  extractionNet: number | null,
  onToggleStarred: (characterId: number) => void,
  timeZone: 'UTC' | undefined,
  groups: readonly CharacterGroup[],
  onMoveToGroup: (characterId: number, groupId: string | null) => void,
  achievements: AchievementLookup
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
    achievement: achievementColumn(t, (row) => row.character.characterId, achievements, false),
    corp: {
      id: 'corp',
      header: t('characters.column.corp'),
      className: 'text-text-dim',
      sortValue: (row) => row.corporationName ?? '',
      render: (row) => <AffiliationName name={row.corporationName} />,
    },
    dockedAt: {
      id: 'dockedAt',
      header: t('characters.column.dockedAt'),
      sortValue: (row) => placeSortText(row.whereabouts?.place ?? null),
      render: (row) => {
        if (!row.locationGranted)
          return missingPermission(row.character.name, 'characterDetails', t);
        const place = row.whereabouts?.place;
        if (!place) return '—';
        const label = placeLabel(place);
        if (label.kind === 'docked') return label.name;
        const system = label.system ?? t('common.unknown');
        return (
          <span>
            {system}{' '}
            <span className="text-text-dim">
              {t(label.kind === 'inSpace' ? 'characters.inSpace' : 'characters.structure')}
            </span>
          </span>
        );
      },
    },
    ship: {
      id: 'ship',
      header: t('characters.column.ship'),
      sortValue: (row) => row.whereabouts?.shipName ?? undefined,
      render: (row) =>
        !row.shipGranted
          ? missingPermission(row.character.name, 'currentShip', t)
          : (row.whereabouts?.shipName ?? '—'),
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
