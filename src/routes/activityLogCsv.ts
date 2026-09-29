import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { ENDPOINT_ROUTES } from '@/esi/endpointRoutes';
import type { ActivityOutcome } from '@/esi/activityLog';
import type { ActivityLogEntry } from '@/stores/activityLog';

export const OUTCOME_LABEL_KEYS = {
  success: 'activityLog.outcomeSuccess',
  authFailure: 'activityLog.outcomeAuthFailure',
  error: 'activityLog.outcomeError',
} as const satisfies Record<ActivityOutcome, string>;

/** Shared "Character" cell for the Activity log and Data age tables, and their exports. */
export function characterCell(
  characterId: number | undefined,
  characterNames: ReadonlyMap<number, string>,
  t: (key: string) => string
): string {
  return characterId === undefined
    ? t('activityLog.publicCall')
    : (characterNames.get(characterId) ?? `#${characterId}`);
}

/** An epoch-ms timestamp as ESI's ISO UTC form — which the exporters write as a real date. */
function isoTime(entry: ActivityLogEntry): string {
  return new Date(entry.timestamp).toISOString();
}

/** Export columns for Settings' Activity log table. */
export function activityLogCsvColumns(
  t: CsvTranslate,
  characterNames: ReadonlyMap<number, string>
): CsvColumn<ActivityLogEntry>[] {
  return [
    { header: t('activityLog.columnEndpoint'), value: (e) => ENDPOINT_ROUTES[e.endpointId] },
    {
      header: t('activityLog.columnCharacter'),
      value: (e) => characterCell(e.characterId, characterNames, t),
    },
    { header: t('activityLog.columnTime'), value: isoTime },
    { header: t('activityLog.columnOutcome'), value: (e) => t(OUTCOME_LABEL_KEYS[e.outcome]) },
  ];
}

/**
 * Export columns for Settings' Data age table. "Updated" exports the fetch
 * time itself: the table's "N min ago" is only true at the moment it's read.
 */
export function dataAgeCsvColumns(
  t: CsvTranslate,
  characterNames: ReadonlyMap<number, string>
): CsvColumn<ActivityLogEntry>[] {
  return [
    { header: t('dataAge.columnEndpoint'), value: (e) => ENDPOINT_ROUTES[e.endpointId] },
    {
      header: t('dataAge.columnCharacter'),
      value: (e) => characterCell(e.characterId, characterNames, t),
    },
    { header: t('dataAge.columnUpdated'), value: isoTime },
  ];
}
