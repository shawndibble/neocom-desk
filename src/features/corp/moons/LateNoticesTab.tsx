import { useMemo } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DataTable, EmptyState, Panel, type DataTableColumn } from '@/components/ui';
import { useBook } from './useBook';
import { caretColumn } from './caretColumn';
import { minerPath } from './moonsPaths';
import { atDate, isk } from './moonsFormat';
import { LateNoticeRun } from './LateNoticeRun';
import { useCards } from './sectionHelpers';

interface NoticeRow {
  minerId: string;
  name: string;
  sent: number;
  unmailed: number;
  lastIssuedAt: string;
  owed: number;
}

/** The late notices sent so far, one row per Miner (#6294): the run above sends the next ones. */
export function LateNoticesTab() {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { view, names } = useBook();
  const navigate = useNavigate();
  const [tableRef, cards] = useCards();

  const rows = useMemo(() => {
    const byMiner = new Map<string, NoticeRow>();
    const minerById = new Map(view.miners.map((m) => [m.id, m]));
    for (const s of view.input.notices) {
      const miner = minerById.get(s.minerId);
      if (!miner) continue;
      const row = byMiner.get(s.minerId) ?? {
        minerId: s.minerId,
        name: names.character(miner.mainCharacterId),
        sent: 0,
        unmailed: 0,
        lastIssuedAt: s.issuedAt,
        owed: miner.owed,
      };
      row.sent += 1;
      if (s.mail.sent === 0) row.unmailed += 1;
      if (s.issuedAt > row.lastIssuedAt) row.lastIssuedAt = s.issuedAt;
      byMiner.set(s.minerId, row);
    }
    return [...byMiner.values()].sort((a, b) => b.lastIssuedAt.localeCompare(a.lastIssuedAt));
  }, [view, names]);

  const columns: DataTableColumn<NoticeRow>[] = [
    {
      id: 'miner',
      header: t('corpTaxBook.moons.cols.miner'),
      primary: true,
      render: (r) => <span className="font-semibold">{r.name}</span>,
      sortValue: (r) => r.name.toLowerCase(),
      sortFirst: 'asc',
    },
    {
      id: 'notices',
      header: t('corpTaxBook.moons.notices.sent'),
      align: 'right',
      className: 'tabular-nums',
      render: (r) =>
        r.unmailed > 0 ? (
          <span className="font-semibold text-warning">
            {t('corpTaxBook.moons.notices.unmailed', { count: r.unmailed, total: r.sent })}
          </span>
        ) : (
          r.sent
        ),
      sortValue: (r) => r.sent,
    },
    {
      id: 'last',
      header: t('corpTaxBook.moons.notices.last'),
      render: (r) => atDate(r.lastIssuedAt, zone),
      sortValue: (r) => r.lastIssuedAt,
      sortFirst: 'desc',
    },
    {
      id: 'owed',
      header: t('corpTaxBook.moons.notices.owed'),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (r) => (r.owed ? isk(r.owed) : '—'),
      sortValue: (r) => r.owed,
    },
    ...(cards ? [] : [caretColumn<NoticeRow>()]),
  ];

  return (
    <div className="space-y-4">
      <LateNoticeRun />
      <Panel title={t('corpTaxBook.moons.notices.title')} padded={false}>
        {rows.length === 0 ? (
          <EmptyState
            title={t('corpTaxBook.moons.notices.empty')}
            className="border-t border-line py-8"
          />
        ) : (
          <div ref={tableRef} className="@container overflow-x-auto">
            <DataTable
              label={t('corpTaxBook.moons.notices.title')}
              columns={columns}
              rows={rows}
              rowKey={(r) => r.minerId}
              onRowClick={(r) => navigate(minerPath(r.minerId))}
              density="compact"
              stacked={cards}
              stackColumns={2}
              mobileSort
            />
          </div>
        )}
      </Panel>
    </div>
  );
}
