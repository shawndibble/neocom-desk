import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import { ENDPOINT_ROUTES } from '@/esi/endpointRoutes';
import type { ActivityOutcome } from '@/esi/activityLog';
import type { ActivityLogEntry } from '@/stores/activityLog';

export const OUTCOME_LABEL_KEYS = {
  success: 'activityLog.outcomeSuccess',
  authFailure: 'activityLog.outcomeAuthFailure',
  error: 'activityLog.outcomeError',
} as const satisfies Record<ActivityOutcome, string>;

export function characterCell(
  characterId: number | undefined,
  characterNames: ReadonlyMap<number, string>,
  t: (key: string) => string
): string {
  return characterId === undefined
    ? t('activityLog.publicCall')
    : (characterNames.get(characterId) ?? `#${characterId}`);
}

function isoTime(entry: ActivityLogEntry): string {
  return new Date(entry.timestamp).toISOString();
}

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
