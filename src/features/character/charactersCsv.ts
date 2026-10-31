import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { extractionTotalIsk, isSpExtractionReady } from '@/engine/skills/spExtraction';
import { maxJobSlots, type JobSlotCategory, type JobSlotSkills } from '@/engine/industry/jobSlots';
import type { CharacterSortStats } from './groups';
import type { QueueInfo } from './rosterView';
import { isPiExpired, type AttentionEntry } from './rosterAttention';
import { placeLabel, type CharacterWhereabouts } from './characterWhereabouts';
import { achievementCsvColumns } from './achievementCsv';
import type { AchievementLookup } from './useCharacterAchievements';

/** The slice of a Characters-table row the export reads (the route's `CharacterRow` satisfies it). */
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
  /** Docked place and hull; undefined until read (the read only runs while its columns show). */
  whereabouts: CharacterWhereabouts | undefined;
}

const JOB_SLOT_CATEGORIES: readonly JobSlotCategory[] = ['manufacturing', 'science', 'reaction'];

/** The Docked at cell's reading of a Character's place: undefined until it is read. */
function placeLabelOf(row: CharacterCsvRow) {
  const place = row.whereabouts?.place;
  return place ? placeLabel(place) : undefined;
}

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
    extractionNet,
    achievements,
    lastSynced,
    now = Date.now,
  }: {
    groupNameById: ReadonlyMap<string, string>;
    /** The SP-ready column only exists while SP-extraction monitoring is on, as in the table. */
    spExtractionEnabled: boolean;
    spExtractionThresholdSp: number;
    /** Net ISK per extractor at the hub; null when unpriced. */
    extractionNet: number | null;
    achievements: AchievementLookup;
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
      // The screen's wording: a named station or structure needs no word; an unnamed
      // structure reads "structure", an item in space "in space".
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
    {
      header: t('characters.column.starred'),
      value: (row) => (row.starred ? t('characters.column.starred') : undefined),
    },
  ];
}
