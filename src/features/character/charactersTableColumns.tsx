import { Link } from 'react-router-dom';
import { HintText } from '@/components/ui/HintText';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { SETTINGS_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import {
  alertsWhenClosedRank,
  corpAccessRank,
  corpRolesRank,
  type CorpStanding,
} from '@/features/corp/corpStanding';
import { rolesText } from '@/features/corp/roles';
import type { AlertsRowState } from '@/features/notifications/alertsGrant';
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
import type { LatestNetWorth } from '@/engine/netWorth/latest';
import { type CharacterColumnId } from '@/features/character/characterColumns';
import { ATTENTION_RANK, ATTENTION_TONE as PI_ATTENTION_TONE } from '@/engine/pi/colonyStatus';
import { formatCountdown, formatDuration } from '@/lib/duration';
import { formatTimestamp } from '@/lib/timestamp';
import { formatIsk } from '@/lib/isk';
import type { CharacterAcceleratorRecord } from '@/db';
import { AcceleratorCell } from '@/features/character/AcceleratorCell';
import {
  placeLabel,
  placeSortText,
  type CharacterWhereabouts,
} from '@/features/character/characterWhereabouts';
import { type CharacterGroup, type CharacterSortStats } from '@/features/character/groups';
import { formatCompactNumber } from '@/lib/compactNumber';
import { AffiliationName } from '@/features/character/CharacterCard';
import { NeedsLoginAction } from '@/features/character/NeedsLoginAction';
import { achievementColumn } from '@/features/character/achievementColumn';
import type { AchievementLookup } from '@/features/character/useCharacterAchievements';
import {
  UNGROUPED_VALUE,
  characterLastSynced,
  queueChipRank,
  queueChipTone,
} from '@/features/character/rosterQueueChip';

export interface CharacterRow {
  character: CharacterRecord;
  corporationName: string | undefined;
  stats: CharacterSortStats | undefined;
  queue: QueueInfo | undefined;
  notTrainingAlertEnabled: boolean;
  attention: AttentionEntry | undefined;
  alertCount: number;
  jobSlotSkills: JobSlotSkills | undefined;
  totalSp: number | undefined;
  starred: boolean;
  spFarm: boolean;
  groupId: string | null;
  whereabouts: CharacterWhereabouts | undefined;
  locationGranted: boolean;
  shipGranted: boolean;
  netWorth: LatestNetWorth | undefined;
  acceleratorRecord: CharacterAcceleratorRecord | undefined;
  detectedAccelerator: number | null;
  corpStanding: CorpStanding | undefined;
  alertsWhenClosed: AlertsRowState;
}

const NOTIFICATION_SETTINGS_PATH = tabPath(SETTINGS_TABS, 'notifications');

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

export function buildColumns(
  t: (key: string, options?: Record<string, unknown>) => string,
  spExtractionThresholdSp: number,
  extractionNet: number | null,
  onToggleStarred: (characterId: number) => void,
  onToggleSpFarm: (characterId: number) => void,
  timeZone: 'UTC' | undefined,
  groups: readonly CharacterGroup[],
  onMoveToGroup: (characterId: number, groupId: string | null) => void,
  achievements: AchievementLookup
): Record<CharacterColumnId, DataTableColumn<CharacterRow>> {
  const corpPermissionsLink = (row: CharacterRow, label: string) => (
    <GrantMissingLink groups={['corp']} asCharacter={row.character.characterId}>
      {label}
    </GrantMissingLink>
  );
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
          <NeedsLoginAction characterId={row.character.characterId} name={row.character.name} />
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
    accelerator: {
      id: 'accelerator',
      header: t('characters.column.accelerator'),
      render: (row) => (
        <AcceleratorCell
          characterId={row.character.characterId}
          name={row.character.name}
          record={row.acceleratorRecord}
          detectedBonus={row.detectedAccelerator}
          timeZone={timeZone}
        />
      ),
    },
    netWorth: {
      id: 'netWorth',
      header: t('characters.column.netWorth'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.netWorth?.total,
      render: (row) => {
        const worth = row.netWorth;
        if (!worth) return t('common.unknown');
        return (
          <HintText
            content={t('characters.netWorthTooltip', {
              day: worth.day,
              isk: formatIsk(worth.layers.isk),
              assets: formatIsk(worth.layers.assets),
              escrow: formatIsk(worth.layers.escrow),
              sellOrders: formatIsk(worth.layers.sellOrders),
              contracts: formatIsk(worth.layers.contracts),
            })}
          >
            <IskAmount value={worth.total} />
          </HintText>
        );
      },
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
        if (expiryMs == null) {
          return <span className={tone}>{t(`pi.attention.${attention}`)}</span>;
        }
        const label = formatDuration((expiryMs - Date.now()) / 1000);
        return (
          <HintText content={formatTimestamp(new Date(expiryMs), timeZone)} className={tone}>
            {t(`pi.attention.${attention}`)} · {label}
          </HintText>
        );
      },
    },
    spFarm: {
      id: 'spFarm',
      header: t('characters.column.spFarm'),
      sortValue: (row) => Number(row.spFarm),
      render: (row) => (
        <IconButton
          size="sm"
          icon={<Icon.SpFarm weight={row.spFarm ? 'fill' : 'light'} />}
          label={t(row.spFarm ? 'characters.unmarkSpFarm' : 'characters.markSpFarm', {
            name: row.character.name,
          })}
          pressed={row.spFarm}
          onClick={() => onToggleSpFarm(row.character.characterId)}
        />
      ),
    },
    spReady: {
      id: 'spReady',
      header: t('characters.column.spReady'),
      sortValue: (row) =>
        row.totalSp === undefined || !row.spFarm
          ? undefined
          : Number(isSpExtractionReady(row.totalSp, spExtractionThresholdSp)),
      render: (row) =>
        row.spFarm &&
        row.totalSp !== undefined &&
        isSpExtractionReady(row.totalSp, spExtractionThresholdSp) ? (
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
    corpRoles: {
      id: 'corpRoles',
      header: t('characters.column.corpRoles'),
      sortFirst: 'asc',
      sortValue: (row) => corpRolesRank(row.corpStanding),
      render: (row) => {
        const standing = row.corpStanding;
        if (!standing) return '—';
        if (standing.kind === 'notGranted') {
          return <span className="text-text-dim">{t('characters.corpRolesNotGranted')}</span>;
        }
        return standing.kind === 'roles' ? rolesText(standing.roles) : '';
      },
    },
    corpAccess: {
      id: 'corpAccess',
      header: t('characters.column.corpAccess'),
      sortFirst: 'asc',
      sortValue: (row) => corpAccessRank(row.corpStanding),
      render: (row) => {
        const standing = row.corpStanding;
        if (!standing) return '—';
        if (standing.kind === 'none') return '';
        if (standing.kind === 'notGranted') {
          return corpPermissionsLink(row, t('characters.corpAccessMissingUnknown'));
        }
        if (standing.missingScopes === 0) {
          return (
            <span className={STAT_CHIP_TONE_TEXT_CLASS.success}>
              {t('characters.corpAccessReady')}
            </span>
          );
        }
        return corpPermissionsLink(
          row,
          t('characters.corpAccessMissing', { count: standing.missingScopes })
        );
      },
    },
    alertsWhenClosed: {
      id: 'alertsWhenClosed',
      header: t('characters.column.alertsWhenClosed'),
      sortFirst: 'asc',
      sortValue: (row) => alertsWhenClosedRank(row.alertsWhenClosed),
      render: (row) => {
        const label = t(`settings.notifications.alertsWhenClosed.state.${row.alertsWhenClosed}`);
        if (row.alertsWhenClosed === 'on') return label;
        return (
          <Link to={NOTIFICATION_SETTINGS_PATH} className={inlineLinkClassName}>
            {label}
          </Link>
        );
      },
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
