import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { PublicInfoEntry } from '@/stores/publicInfo';
import { isSpExtractionReady } from '@/engine/spExtraction';
import { maxJobSlots, type JobSlotCategory, type JobSlotSkills } from '@/engine/industry/jobSlots';
import type { CharacterSortStats } from './groups';
import type { QueueInfo } from './rosterView';
import { isPiExpired, type AttentionEntry } from './rosterAttention';

/** The slice of a Characters-table row the export reads (the route's `CharacterRow` satisfies it). */
export interface CharacterCsvRow {
  character: { name: string };
  info: PublicInfoEntry | undefined;
  groupId: string | null;
  stats: CharacterSortStats | undefined;
  queue: QueueInfo | undefined;
  attention: AttentionEntry | undefined;
  jobSlotSkills: JobSlotSkills | undefined;
  totalSp: number | undefined;
  alertCount: number;
  starred: boolean;
}

const JOB_SLOT_CATEGORIES: readonly JobSlotCategory[] = ['manufacturing', 'science', 'reaction'];

function isoOrUndefined(ms: number | null | undefined): string | undefined {
  return ms == null ? undefined : new Date(ms).toISOString();
}

/**
 * Export columns for the Characters table — every data column, whatever the
 * Columns picker currently shows (the file is data, not a screenshot), minus
 * the Remove button. Where the table shows a countdown (training, PI) the
 * file carries the state label plus the moment itself as a separate date
 * column, since a countdown is stale the second it's written.
 */
export function charactersCsvColumns(
  t: CsvTranslate,
  {
    groupNameById,
    spExtractionEnabled,
    spExtractionThresholdSp,
    lastSynced,
    now = Date.now,
  }: {
    groupNameById: ReadonlyMap<string, string>;
    /** The SP-ready column only exists while SP-extraction monitoring is on, as in the table. */
    spExtractionEnabled: boolean;
    spExtractionThresholdSp: number;
    /** The route's one "how stale is this character" rule, shared with its card and table. */
    lastSynced: (row: CharacterCsvRow) => Date | undefined;
    /** The clock PI expiry is read against, at export time. Injected for tests. */
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
      value: (row) => row.info?.corporationName ?? undefined,
    },
    {
      header: t('characters.column.group'),
      value: (row) => (row.groupId === null ? undefined : groupNameById.get(row.groupId)),
    },
    { header: t('characters.column.spTotal'), value: (row) => row.stats?.skillPoints },
    { header: t('characters.column.wallet'), value: (row) => row.stats?.wallet },
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
        // An expiry already passed reads as stopped, as the table shows it.
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
            header: t('characters.column.spReady'),
            value: (row) =>
              row.totalSp !== undefined && isSpExtractionReady(row.totalSp, spExtractionThresholdSp)
                ? t('characters.spReadyYes')
                : undefined,
          } satisfies CsvColumn<CharacterCsvRow>,
        ]
      : []),
    { header: t('characters.column.alerts'), value: (row) => row.alertCount },
    {
      header: t('characters.column.starred'),
      value: (row) => (row.starred ? t('characters.column.starred') : undefined),
    },
  ];
}
