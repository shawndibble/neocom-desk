import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCharacterNames } from '@/features/character/useCharacters';
import { CollapsiblePanel, DataTable, EmptyState, type DataTableColumn } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { useTimeZone } from '@/lib/timeFormat';
import { formatAge } from '@/lib/age';
import { useTicker } from '@/lib/ticker';
import { formatTimestamp } from '@/lib/timestamp';
import { ENDPOINT_ROUTES } from '@/esi/endpointRoutes';
import { useActivityLog, type ActivityLogEntry } from '@/stores/activityLog';
import { characterCell, dataAgeCsvColumns } from '@/features/settings/activityLogCsv';
import { CharacterNameCell } from '@/features/settings/CharacterNameCell';
import { SettingsHint } from '@/features/settings/settingsFields';

/**
 * The most recent *successful* fetch per endpoint/character pair — the
 * `DataAgeBadge` on every view, collected into one list for the surface that
 * replaces it on mobile (docs/context/decisions). A failed call never
 * updated anything, so it's excluded rather than shown as a "last updated".
 *
 * `entries` is most-recent-first (`stores/activityLog.ts`), so keeping only
 * the first entry seen per key already yields the latest one, in order —
 * no separate sort needed.
 */
function latestFetchPerSource(entries: ActivityLogEntry[]): ActivityLogEntry[] {
  const seen = new Map<string, ActivityLogEntry>();
  for (const entry of entries) {
    if (entry.outcome !== 'success') continue;
    const key = `${entry.endpointId}:${entry.characterId ?? 'public'}`;
    if (!seen.has(key)) seen.set(key, entry);
  }
  return [...seen.values()];
}

/** `DataAgeBadge`'s cadence: ages are shown to the minute. */
const RELATIVE_AGE_TICK_MS = 30_000;

/**
 * "N min ago", kept current by the shared ticker. Its own component rather
 * than a `Date.now()` in the column's `render`: `DataTable`'s rows are
 * memoized, so a render-time read would freeze at whatever it said when the
 * row last changed.
 */
function RelativeAge({ timestamp }: { timestamp: number }) {
  const { t } = useTranslation();
  const now = useTicker(RELATIVE_AGE_TICK_MS);
  return formatAge(now - timestamp, t);
}

/** The folded Data Age panel's one-line read: how many sources, and how fresh the newest is. */
function DataAgeSummary({ rows }: { rows: ActivityLogEntry[] }) {
  const { t } = useTranslation();
  const now = useTicker(RELATIVE_AGE_TICK_MS);
  const newest = Math.max(...rows.map((entry) => entry.timestamp));
  return t('dataAge.summary', { count: rows.length, age: formatAge(now - newest, t) });
}

export function DataAgePanel() {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const timeZone = useTimeZone();
  const entries = useActivityLog((state) => state.entries);
  const characterNames = useCharacterNames();
  const rows = useMemo(() => latestFetchPerSource(entries), [entries]);

  const columns = useMemo<DataTableColumn<ActivityLogEntry>[]>(
    () => [
      {
        id: 'endpoint',
        header: t('dataAge.columnEndpoint'),
        className: 'font-mono text-[0.6875rem] text-text-dim',
        sortValue: (entry) => ENDPOINT_ROUTES[entry.endpointId],
        render: (entry) => ENDPOINT_ROUTES[entry.endpointId],
      },
      {
        id: 'character',
        header: t('dataAge.columnCharacter'),
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
        id: 'updated',
        header: t('dataAge.columnUpdated'),
        cardCorner: true,
        className: 'whitespace-nowrap text-text-dim',
        sortValue: (entry) => entry.timestamp,
        render: (entry) => (
          <HintText content={formatTimestamp(new Date(entry.timestamp), timeZone)}>
            <RelativeAge timestamp={entry.timestamp} />
          </HintText>
        ),
      },
    ],
    [t, characterNames, timeZone]
  );
  const csvColumns = useMemo(() => dataAgeCsvColumns(t, characterNames), [t, characterNames]);
  const tableExport = useTableExport({ surface: 'data-age', rows, columns: csvColumns });

  return (
    <CollapsiblePanel
      title={t('dataAge.title')}
      meta={rows.length > 0 && <DataAgeSummary rows={rows} />}
      wrapMeta
      expanded={expanded}
      onToggle={() => setExpanded((open) => !open)}
      labels={{ show: t('dataAge.show'), hide: t('dataAge.hide') }}
      collapsible={rows.length > 0}
      actions={
        rows.length > 0 && <TableActionsMenu name={t('dataAge.title')} tableExport={tableExport} />
      }
    >
      <div className="space-y-2">
        <SettingsHint>{t('dataAge.hint')}</SettingsHint>
        {rows.length === 0 ? (
          <EmptyState title={t('dataAge.emptyTitle')} hint={t('dataAge.emptyHint')} />
        ) : (
          <DataTable
            {...tableExport.tableProps}
            columns={columns}
            rows={rows}
            rowKey={(entry) => entry.id}
            label={t('dataAge.title')}
            density="compact"
            // §4a: a log read row by row, not compared across columns, so a
            // phone gets a two-line card (endpoint, then character) with the
            // age at the right, not a table wider than the screen.
            stackLayout="dense"
          />
        )}
      </div>
    </CollapsiblePanel>
  );
}
