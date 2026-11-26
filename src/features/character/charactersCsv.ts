import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { extractionTotalIsk, isSpExtractionReady } from '@/engine/skills/spExtraction';
import { maxJobSlots, type JobSlotCategory, type JobSlotSkills } from '@/engine/industry/jobSlots';
import type { CharacterSortStats } from './groups';
import type { QueueInfo } from './rosterView';
import { isPiExpired, type AttentionEntry } from './rosterAttention';
import { placeLabel, type CharacterWhereabouts } from './characterWhereabouts';
import { achievementCsvColumns } from './achievementCsv';
import type { AchievementLookup } from './useCharacterAchievements';
import type { CorpStanding } from '@/features/corp/corpStanding';
import { rolesText } from '@/features/corp/roles';
import type { AlertsRowState } from '@/features/notifications/alertsGrant';

export interface CharacterCsvRow {
  character: { characterId: number; name: string };
  corporationName: string | undefined;
  groupId: string | null;
  stats: CharacterSortStats | undefined;
  queue: QueueInfo | undefined;
  attention: AttentionEntry | undefined;
  jobSlotSkills: JobSlotSkills | undefined;
  totalSp: number | undefined;
  alertCount: number;
  starred: boolean;
  spFarm: boolean;
  whereabouts: CharacterWhereabouts | undefined;
  corpStanding: CorpStanding | undefined;
  alertsWhenClosed: AlertsRowState;
}

const JOB_SLOT_CATEGORIES: readonly JobSlotCategory[] = ['manufacturing', 'science', 'reaction'];

function placeLabelOf(row: CharacterCsvRow) {
  const place = row.whereabouts?.place;
  return place ? placeLabel(place) : undefined;
}

function isoOrUndefined(ms: number | null | undefined): string | undefined {
  return ms == null ? undefined : new Date(ms).toISOString();
}

export function charactersCsvColumns(
  t: CsvTranslate,
  {
    groupNameById,
    spExtractionEnabled,
    spExtractionThresholdSp,
    extractionNet,
    achievements,
    lastSynced,
    corpColumns = false,
    alertsWhenClosedColumn = false,
    now = Date.now,
  }: {
    groupNameById: ReadonlyMap<string, string>;
    spExtractionEnabled: boolean;
    spExtractionThresholdSp: number;
    extractionNet: number | null;
    achievements: AchievementLookup;
    lastSynced: (row: CharacterCsvRow) => Date | undefined;
    corpColumns?: boolean;
    alertsWhenClosedColumn?: boolean;
    now?: () => number;
  }
): CsvColumn<CharacterCsvRow>[] {
  const openSlots = (row: CharacterCsvRow, category: JobSlotCategory) => {
    const running = row.attention?.jobCounts?.[category];
    const max = row.jobSlotSkills ? maxJobSlots(row.jobSlotSkills)[category] : undefined;
    return running === undefined || max === undefined ? undefined : max - running;
  };
  return [
    { header: t('characters.column.name'), value: (row) => row.character.name },
    {
      header: t('characters.column.corp'),
      value: (row) => row.corporationName,
    },
    ...achievementCsvColumns<CharacterCsvRow>(t, (row) => row.character.characterId, achievements),
    {
      header: t('characters.column.group'),
      value: (row) => (row.groupId === null ? undefined : groupNameById.get(row.groupId)),
    },
    { header: t('characters.column.spTotal'), value: (row) => row.stats?.skillPoints },
    { header: t('characters.column.wallet'), value: (row) => row.stats?.wallet },
    {
      header: t('characters.csvDockedAt'),
      value: (row) => {
        const label = placeLabelOf(row);
        return label?.kind === 'docked' ? label.name : undefined;
      },
    },
    { header: t('characters.csvSystem'), value: (row) => row.whereabouts?.place?.systemName },
    {
      header: t('characters.csvPlaceKind'),
      value: (row) => {
        const label = placeLabelOf(row);
        if (!label) return undefined;
        return label.kind === 'docked'
          ? t('characters.csvPlaceDocked')
          : t(label.kind === 'inSpace' ? 'characters.inSpace' : 'characters.structure');
      },
    },
    { header: t('characters.column.ship'), value: (row) => row.whereabouts?.shipName },
    {
      header: t('characters.column.lastSynced'),
      value: (row) => lastSynced(row)?.toISOString(),
    },
    {
      header: t('characters.column.training'),
      value: (row) => (row.queue ? t(`characters.queueStates.${row.queue.state}`) : undefined),
    },
    {
      header: t('characters.csvTrainingFinishes'),
      value: (row) => isoOrUndefined(row.queue?.trainingFinishMs),
    },
    ...JOB_SLOT_CATEGORIES.map((category): CsvColumn<CharacterCsvRow> => ({
      header: t(`characters.jobSlotCategory.${category}`),
      value: (row) => openSlots(row, category),
    })),
    {
      header: t('characters.column.pi'),
      value: (row) => {
        const attention = row.attention?.piAttention;
        if (attention === undefined) return undefined;
        if (isPiExpired(row.attention?.piSoonestExpiryMs, now())) return t('pi.attention.idle');
        return t(`pi.attention.${attention}`);
      },
    },
    {
      header: t('characters.csvPiExpires'),
      value: (row) => isoOrUndefined(row.attention?.piSoonestExpiryMs),
    },
    ...(spExtractionEnabled
      ? [
          {
            header: t('characters.column.spFarm'),
            value: (row) => (row.spFarm ? t('characters.spFarmYes') : undefined),
          } satisfies CsvColumn<CharacterCsvRow>,
          {
            header: t('characters.column.spReady'),
            value: (row) =>
              row.spFarm &&
              row.totalSp !== undefined &&
              isSpExtractionReady(row.totalSp, spExtractionThresholdSp)
                ? t('characters.spReadyYes')
                : undefined,
          } satisfies CsvColumn<CharacterCsvRow>,
          {
            header: t('characters.csvSpReadyValue'),
            value: (row) =>
              row.spFarm &&
              row.totalSp !== undefined &&
              isSpExtractionReady(row.totalSp, spExtractionThresholdSp)
                ? extractionTotalIsk(row.totalSp, extractionNet)
                : undefined,
          } satisfies CsvColumn<CharacterCsvRow>,
        ]
      : []),
    { header: t('characters.column.alerts'), value: (row) => row.alertCount },
    ...(corpColumns
      ? [
          {
            header: t('characters.column.corpRoles'),
            value: (row) => {
              const standing = row.corpStanding;
              if (standing?.kind === 'notGranted') return t('characters.corpRolesNotGranted');
              return standing?.kind === 'roles'
                ? (rolesText(standing.roles) ?? undefined)
                : undefined;
            },
          } satisfies CsvColumn<CharacterCsvRow>,
          {
            header: t('characters.column.corpAccess'),
            value: (row) => {
              const standing = row.corpStanding;
              if (standing?.kind === 'notGranted') return t('characters.corpAccessMissingUnknown');
              if (standing?.kind !== 'roles') return undefined;
              return standing.missingScopes === 0
                ? t('characters.corpAccessReady')
                : t('characters.corpAccessMissing', { count: standing.missingScopes });
            },
          } satisfies CsvColumn<CharacterCsvRow>,
        ]
      : []),
    ...(alertsWhenClosedColumn
      ? [
          {
            header: t('characters.column.alertsWhenClosed'),
            value: (row) =>
              t(`settings.notifications.alertsWhenClosed.state.${row.alertsWhenClosed}`),
          } satisfies CsvColumn<CharacterCsvRow>,
        ]
      : []),
    {
      header: t('characters.column.starred'),
      value: (row) => (row.starred ? t('characters.column.starred') : undefined),
    },
  ];
}
