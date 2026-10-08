/**
 * What a pasted Local list or D-Scan becomes in Pilot Lookup (issue #2863):
 * a sortable table of pilots with zKillboard's danger and gang ratios, or a
 * D-Scan's ships counted by class. It replaces the single-pilot card; a row
 * opens that pilot (`?pilot=`), so Back returns to the list.
 *
 * Numbers, never verdicts (decision `20260912-172628`): a row states 68%,
 * it never calls the pilot hostile or safe.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, EmptyState, Panel, Spinner, type DataTableColumn } from '@/components/ui';
import { bucketDscan, type DscanSummary } from '@/engine/pilotList/dscanClasses';
import type { PilotPaste } from '@/engine/pilotList/parsePilotPaste';
import { loadGroupCategories, loadTypes } from '@/sde/loadSde';
import { loadPilotList, type PilotListRow } from './pilotListData';

type LocalPaste = Extract<PilotPaste, { kind: 'local' }>;
type DscanPaste = Extract<PilotPaste, { kind: 'dscan' }>;

export function PilotListView({
  paste,
  onOpen,
}: {
  paste: PilotPaste;
  onOpen: (characterId: number) => void;
}) {
  return paste.kind === 'local' ? (
    <LocalList key={paste.names.join('|')} paste={paste} onOpen={onOpen} />
  ) : (
    <DscanClasses paste={paste} />
  );
}

function percent(value: number | null | undefined): string | undefined {
  return value === null || value === undefined ? undefined : `${Math.round(value)}%`;
}

function LocalList({
  paste,
  onOpen,
}: {
  paste: LocalPaste;
  onOpen: (characterId: number) => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<PilotListRow[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    loadPilotList(paste.names, { signal: controller.signal, onRows: setRows }).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, [paste]);

  if (failed) {
    return (
      <EmptyState
        title={t('travel.pilot.list.failedTitle')}
        hint={t('travel.pilot.list.failedHint')}
      />
    );
  }

  const settled = rows.filter((row) => row.state.kind !== 'loading').length;
  const notFound = rows.filter((row) => row.state.kind === 'not-found').map((row) => row.name);

  const dash = '—';
  const columns: DataTableColumn<PilotListRow>[] = [
    {
      id: 'pilot',
      header: t('travel.pilot.list.pilot'),
      stickyStart: true,
      sortValue: (row) => row.name.toLowerCase(),
      render: (row) => row.name,
    },
    {
      id: 'corporation',
      phoneHidden: true,
      header: t('travel.pilot.list.corporation'),
      sortValue: (row) => row.corporationName?.toLowerCase(),
      render: (row) => row.corporationName ?? dash,
      className: 'text-text-dim',
    },
    {
      id: 'alliance',
      phoneHidden: true,
      header: t('travel.pilot.list.alliance'),
      sortValue: (row) => row.allianceName?.toLowerCase(),
      render: (row) => row.allianceName ?? dash,
      className: 'text-text-dim',
    },
    {
      id: 'danger',
      header: t('travel.pilot.list.danger'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) =>
        row.state.kind === 'stats' ? (row.state.stats.dangerRatio ?? undefined) : undefined,
      render: (row) =>
        row.state.kind === 'stats'
          ? (percent(row.state.stats.dangerRatio) ?? dash)
          : stateLabel(row, t),
    },
    {
      id: 'gang',
      header: t('travel.pilot.list.gang'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) =>
        row.state.kind === 'stats' ? (row.state.stats.gangRatio ?? undefined) : undefined,
      render: (row) =>
        row.state.kind === 'stats' ? (percent(row.state.stats.gangRatio) ?? dash) : dash,
    },
    {
      id: 'kills',
      header: t('travel.pilot.list.kills'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => (row.state.kind === 'stats' ? row.state.stats.kills : undefined),
      render: (row) => (row.state.kind === 'stats' ? row.state.stats.kills.toLocaleString() : dash),
    },
  ];

  return (
    <Panel className="space-y-3">
      {settled < rows.length && (
        <p role="status" className="flex items-center gap-2 text-xs text-text-dim">
          <Spinner label={t('common.loading')} />
          {t('travel.pilot.list.progress', { done: settled, total: rows.length })}
        </p>
      )}
      <DataTable
        label={t('travel.pilot.list.tableLabel')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.name}
        responsive="table"
        defaultSort={{ columnId: 'danger', direction: 'desc' }}
        onRowClick={(row) => row.characterId !== null && onOpen(row.characterId)}
        rowClickable={(row) => row.characterId !== null}
      />
      {notFound.length > 0 && (
        <p className="text-xs text-text-dim">
          {t('travel.pilot.list.notFoundNames', {
            count: notFound.length,
            names: notFound.join(', '),
          })}
        </p>
      )}
      {paste.overflow > 0 && (
        <p className="text-xs text-text-dim">
          {t('travel.pilot.list.overflow', { shown: paste.names.length, count: paste.overflow })}
        </p>
      )}
    </Panel>
  );
}

function stateLabel(row: PilotListRow, t: (key: string) => string): string {
  switch (row.state.kind) {
    case 'loading':
      return t('travel.pilot.list.stateLoading');
    case 'not-found':
      return t('travel.pilot.list.stateNotFound');
    case 'no-history':
      return t('travel.pilot.list.stateNoHistory');
    case 'unreachable':
      return t('travel.pilot.list.stateUnreachable');
    case 'stats':
      return '';
  }
}

function DscanClasses({ paste }: { paste: DscanPaste }) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<{ summary: DscanSummary; names: Map<number, string> }>();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadTypes(), loadGroupCategories()]).then(([types, categories]) => {
      if (cancelled) return;
      const result = bucketDscan(paste.typeIds, (typeId) => {
        const type = types[String(typeId)];
        return type === undefined
          ? undefined
          : { groupId: type.groupID, categoryId: categories[String(type.groupID)] ?? 0 };
      });
      const names = new Map<number, string>();
      for (const c of result.classes) {
        for (const { typeId } of c.types)
          names.set(typeId, types[String(typeId)]?.name ?? `#${typeId}`);
      }
      setSummary({ summary: result, names });
    });
    return () => {
      cancelled = true;
    };
  }, [paste]);

  if (summary === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (summary.summary.classes.length === 0) {
    return (
      <EmptyState
        title={t('travel.pilot.dscan.emptyTitle')}
        hint={t('travel.pilot.dscan.emptyHint')}
      />
    );
  }
  return (
    <Panel className="space-y-4">
      {summary.summary.classes.map((c) => (
        <section key={c.bucket} aria-label={t(`travel.pilot.dscan.bucket.${c.bucket}`)}>
          <h3 className="text-sm font-semibold text-text">
            {t(`travel.pilot.dscan.bucket.${c.bucket}`)}{' '}
            <span className="tabular-nums text-text-dim">{c.total}</span>
          </h3>
          <ul className="mt-1 space-y-0.5 text-xs text-text-dim">
            {c.types.map(({ typeId, count }) => (
              <li key={typeId} className="flex gap-2">
                <span className="w-8 text-right tabular-nums">{count}</span>
                <span>{summary.names.get(typeId)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {summary.summary.leftOut > 0 && (
        <p className="text-xs text-text-dim">
          {t('travel.pilot.dscan.leftOut', { count: summary.summary.leftOut })}
        </p>
      )}
    </Panel>
  );
}
