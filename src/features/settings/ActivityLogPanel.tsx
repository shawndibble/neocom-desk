import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCharacterNames } from '@/features/character/useCharacters';
import { Button, DataTable, EmptyState, Panel, type DataTableColumn } from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';
import { ENDPOINT_ROUTES } from '@/esi/endpointRoutes';
import { useActivityLog, type ActivityLogEntry } from '@/stores/activityLog';
import type { ActivityOutcome } from '@/esi/activityLog';
import { ActionResult, SettingsHint } from '@/features/settings/settingsFields';
import {
  activityLogCsvColumns,
  characterCell,
  OUTCOME_LABEL_KEYS,
} from '@/features/settings/activityLogCsv';
import { CharacterNameCell } from '@/features/settings/CharacterNameCell';

const OUTCOME_TONE: Record<ActivityOutcome, string> = {
  success: 'text-success',
  authFailure: 'text-warning',
  error: 'text-danger',
};

export function ActivityLogPanel() {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const entries = useActivityLog((state) => state.entries);
  const clearLog = useActivityLog((state) => state.clear);
  const characterNames = useCharacterNames();
  const [clearedConfirm, setClearedConfirm] = useState(false);

  function handleClear() {
    clearLog();
    setClearedConfirm(true);
    setTimeout(() => setClearedConfirm(false), 2000);
  }

  const columns = useMemo<DataTableColumn<ActivityLogEntry>[]>(
    () => [
      {
        id: 'endpoint',
        header: t('activityLog.columnEndpoint'),
        className: 'font-mono text-[0.6875rem] text-text-dim',
        sortValue: (entry) => ENDPOINT_ROUTES[entry.endpointId],
        render: (entry) => ENDPOINT_ROUTES[entry.endpointId],
      },
      {
        id: 'character',
        header: t('activityLog.columnCharacter'),
        phoneHidden: true,
        sortValue: (entry) => characterCell(entry.characterId, characterNames, t),
        render: (entry) => (
          <CharacterNameCell
            characterId={entry.characterId}
            characterNames={characterNames}
            t={t}
          />
        ),
      },
      {
        id: 'time',
        header: t('activityLog.columnTime'),
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (entry) => entry.timestamp,
        // Full date, not just time-of-day: a session that crosses midnight
        // otherwise makes two entries on different days read as minutes apart.
        render: (entry) => formatTimestamp(new Date(entry.timestamp), timeZone),
      },
      {
        id: 'outcome',
        header: t('activityLog.columnOutcome'),
        className: 'font-semibold',
        cellClassName: (entry) => OUTCOME_TONE[entry.outcome],
        sortValue: (entry) => t(OUTCOME_LABEL_KEYS[entry.outcome]),
        render: (entry) => t(OUTCOME_LABEL_KEYS[entry.outcome]),
      },
    ],
    [t, characterNames, timeZone]
  );
  const csvColumns = useMemo(() => activityLogCsvColumns(t, characterNames), [t, characterNames]);
  const tableExport = useTableExport({
    surface: 'activity-log',
    rows: entries,
    columns: csvColumns,
  });

  return (
    <Panel
      title={t('activityLog.title')}
      actions={
        <>
          <Button size="sm" onClick={handleClear} aria-disabled={entries.length === 0}>
            {t('activityLog.clearLog')}
          </Button>
          {entries.length > 0 && (
            <TableActionsMenu name={t('activityLog.title')} tableExport={tableExport} />
          )}
        </>
      }
    >
      <div className="space-y-2">
        <SettingsHint>{t('activityLog.hint')}</SettingsHint>
        {clearedConfirm && (
          <ActionResult kind="success">{t('activityLog.clearedConfirm')}</ActionResult>
        )}
        {entries.length === 0 ? (
          <EmptyState title={t('activityLog.emptyTitle')} hint={t('activityLog.emptyHint')} />
        ) : (
          <DataTable
            {...tableExport.tableProps}
            columns={columns}
            rows={entries}
            rowKey={(entry) => entry.id}
            label={t('activityLog.title')}
            density="compact"
            responsive="table"
          />
        )}
      </div>
    </Panel>
  );
}
