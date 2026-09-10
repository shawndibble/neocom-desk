/**
 * Mining Yield Overview tab (issue #671): what a pilot actually mined —
 * ordinary belt/anomaly ore and ice, moon ore included — across every
 * tracked Character, as ISK/hr and a raw-vs-refined value comparison. Sits
 * beside the Tax tab (`TaxTab.tsx`) on the same route; the two read the same
 * ESI mining ledger but group and value it for entirely different questions
 * (see `docs/context/decisions/…-mining-yield-isk-hr-basis-is-calendar-time.md`
 * and the vocabulary note in the issue: this is deliberately not the Tax
 * tab's `MiningLedgerEntry`/`Assignment`/`Payee` model).
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  Panel,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { formatIsk } from '@/lib/isk';
import { formatVolume } from '@/features/market/format';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import {
  useResolvedCharacterFilter,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { SecurityValue } from '@/features/character/assetBrowserRows';
import {
  loadMiningYieldSnapshot,
  type MiningYieldRow,
  type MiningYieldSnapshot,
} from './yieldSnapshot';
import { iskPerCalendarHour } from '@/engine/miningTax/yieldRate';
import type { DailyRatePoint, TypeComparisonPoint } from './MiningYieldCharts';

const LazyMiningYieldCharts = lazy(() => import('./MiningYieldCharts'));

/**
 * Ignores both arguments `useRouteSnapshot` passes — this view isn't scoped
 * to the active Character (every tracked Character, same as the Tax tab) and
 * `loadMiningYieldSnapshot` has no mid-flight cancellation checkpoint to gate
 * on `signal`.
 */
function loadSnapshot(): Promise<MiningYieldSnapshot> {
  return loadMiningYieldSnapshot();
}

function dateRangeLabel(dates: readonly string[]): string {
  if (dates.length === 0) return '—';
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return first === last ? first : `${first} – ${last}`;
}

export function OverviewTab() {
  const { t } = useTranslation();
  const { data, error, loading, activeCharacterId, refresh } = useRouteSnapshot(
    loadSnapshot,
    undefined,
    { cacheKey: 'miningYieldOverview' }
  );

  const [characterFilter, setCharacterFilter] = useState<CharacterFilterValue>('all');
  const resolvedCharacterFilter = useResolvedCharacterFilter(characterFilter, activeCharacterId);

  const characters = data?.characters ?? [];
  const showCharacterColumn = characters.length > 1;

  const visibleRows = useMemo(
    () =>
      (data?.rows ?? []).filter(
        (row) => resolvedCharacterFilter === 'all' || resolvedCharacterFilter.has(row.characterId)
      ),
    [data, resolvedCharacterFilter]
  );

  const totals = useMemo(() => {
    let rawValue = 0;
    let refineValue = 0;
    let volume = 0;
    const dates: string[] = [];
    for (const row of visibleRows) {
      rawValue += row.valuation.rawValue;
      refineValue += row.valuation.refineValue;
      dates.push(row.entry.date);
      for (const line of row.entry.oreLines) volume += line.quantity;
    }
    return {
      rawValue,
      refineValue,
      volume,
      dates,
      iskPerHour: iskPerCalendarHour(rawValue, dates),
    };
  }, [visibleRows]);

  const dailyRate: DailyRatePoint[] = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const row of visibleRows) {
      byDate.set(row.entry.date, (byDate.get(row.entry.date) ?? 0) + row.valuation.rawValue);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, iskPerHour: value / 24 }));
  }, [visibleRows]);

  const typeComparison: TypeComparisonPoint[] = useMemo(() => {
    const byType = new Map<number, { rawValue: number; refineValue: number }>();
    for (const row of visibleRows) {
      for (const line of row.valuation.lines) {
        const existing = byType.get(line.typeId) ?? { rawValue: 0, refineValue: 0 };
        existing.rawValue += line.rawValue;
        existing.refineValue += line.refineValue;
        byType.set(line.typeId, existing);
      }
    }
    return [...byType.entries()]
      .map(([typeId, values]) => ({
        typeId,
        typeName: data?.typeNames.get(typeId) ?? `#${typeId}`,
        ...values,
      }))
      .sort((a, b) => b.rawValue + b.refineValue - (a.rawValue + a.refineValue))
      .slice(0, 12);
  }, [visibleRows, data]);

  function systemName(row: MiningYieldRow): string {
    return data?.systemNames.get(row.entry.solarSystemId) ?? `#${row.entry.solarSystemId}`;
  }

  const columns: DataTableColumn<MiningYieldRow>[] = [
    ...(showCharacterColumn
      ? [
          {
            id: 'character',
            header: t('miningTax.characterColumn'),
            render: (row: MiningYieldRow) => row.characterName,
            sortValue: (row: MiningYieldRow) => row.characterName,
          } satisfies DataTableColumn<MiningYieldRow>,
        ]
      : []),
    {
      id: 'date',
      header: t('miningTax.dateColumn'),
      headerTooltip: t('miningTax.dateEveHint'),
      render: (row) => row.entry.date,
      sortValue: (row) => row.entry.date,
      primary: true,
    },
    {
      id: 'system',
      header: t('miningTax.systemColumn'),
      render: (row) => (
        <span className="flex items-center gap-1.5">
          {systemName(row)}
          <SecurityValue security={data?.systemSecurity.get(row.entry.solarSystemId)} t={t} />
        </span>
      ),
      sortValue: (row) => systemName(row),
    },
    {
      id: 'volume',
      header: t('miningTax.overview.volumeColumn'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => formatVolume(row.entry.oreLines.reduce((sum, l) => sum + l.quantity, 0)),
      sortValue: (row) => row.entry.oreLines.reduce((sum, l) => sum + l.quantity, 0),
    },
    {
      id: 'rawValue',
      header: t('miningTax.overview.rawSellValue'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => `${formatIsk(row.valuation.rawValue)} ISK`,
      sortValue: (row) => row.valuation.rawValue,
    },
    {
      id: 'refineValue',
      header: t('miningTax.overview.refineValue'),
      align: 'right',
      className: 'whitespace-nowrap',
      render: (row) => `${formatIsk(row.valuation.refineValue)} ISK`,
      sortValue: (row) => row.valuation.refineValue,
    },
    {
      id: 'pricing',
      header: t('miningTax.overview.pricingColumn'),
      className: 'whitespace-nowrap',
      cellClassName: (row) => (row.valuation.pricedAll ? 'text-text-dim' : 'text-warning'),
      render: (row) =>
        row.valuation.pricedAll
          ? t('miningTax.overview.pricingFull')
          : t('miningTax.overview.pricingPartial'),
      sortValue: (row) => (row.valuation.pricedAll ? 1 : 0),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {data?.fetchedAt && <DataAgeBadge date={data.fetchedAt} />}
          {characters.length > 0 && (
            <CharacterFilterControl
              characters={characters.map((c) => ({
                characterId: c.characterId,
                characterName: c.characterName,
              }))}
              activeCharacterId={activeCharacterId}
              value={characterFilter}
              onChange={setCharacterFilter}
            />
          )}
        </div>
        <IconButton
          icon={<Icon.Refresh />}
          label={t('miningTax.refresh')}
          onClick={refresh}
          disabled={loading}
        />
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : (
        <>
          {data && data.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}

          {data && data.reauthCharacters.length > 0 && (
            <div
              role="alert"
              className="space-y-1 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs"
            >
              <p className="font-semibold text-warning uppercase">{t('miningTax.reauthTitle')}</p>
              <ul className="space-y-1">
                {data.reauthCharacters.map((c) => (
                  <li key={c.characterId} className="flex items-center justify-between gap-2">
                    <span>
                      {t('miningTax.reauthCharacterHint', { character: c.characterName })}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => void beginEveLogin({ characterId: c.characterId })}
                    >
                      {t('miningTax.reauthAction')}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/*
            One row per ore/ice type whose current price has moved
            meaningfully from the mined-date price the table below actually
            used — so a pilot reading the totals as "what I'd get selling
            today" isn't misled (issue #671's acceptance criteria).
          */}
          {data && data.priceNotes.length > 0 && (
            <div
              role="alert"
              className="space-y-1 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs"
            >
              <p className="font-semibold text-warning uppercase">
                {t('miningTax.overview.priceNoteTitle')}
              </p>
              <ul className="space-y-0.5 text-text-dim">
                {data.priceNotes.map((note) => (
                  <li key={note.typeId}>
                    {t('miningTax.overview.priceNoteLine', {
                      type: data.typeNames.get(note.typeId) ?? `#${note.typeId}`,
                      percent: Math.abs(note.divergence.percentChange).toFixed(0),
                      direction:
                        note.divergence.percentChange >= 0
                          ? t('miningTax.overview.priceNoteHigher')
                          : t('miningTax.overview.priceNoteLower'),
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {visibleRows.length === 0 ? (
            <EmptyState
              title={t('miningTax.overview.emptyTitle')}
              hint={t('miningTax.overview.emptyHint')}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Panel>
                  <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('miningTax.overview.totalValueStat')}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {formatIsk(totals.rawValue, 0)} ISK
                  </p>
                </Panel>
                <Panel>
                  <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('miningTax.overview.iskPerHourStat')}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {totals.iskPerHour !== null ? `${formatIsk(totals.iskPerHour, 0)} ISK` : '—'}
                  </p>
                  <p className="text-[0.6875rem] text-text-dim">
                    {t('miningTax.overview.iskPerHourBasisHint')}
                  </p>
                </Panel>
                <Panel>
                  <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('miningTax.overview.volumeStat')}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {formatVolume(totals.volume)}
                  </p>
                </Panel>
                <Panel>
                  <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('miningTax.overview.dateRangeStat')}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{dateRangeLabel(totals.dates)}</p>
                </Panel>
              </div>

              <Panel padded>
                <Suspense
                  fallback={
                    <div className="flex justify-center py-8">
                      <Spinner label={t('common.loading')} />
                    </div>
                  }
                >
                  <LazyMiningYieldCharts dailyRate={dailyRate} typeComparison={typeComparison} />
                </Suspense>
              </Panel>

              <Panel padded={false}>
                <div className="overflow-x-auto">
                  <DataTable
                    columns={columns}
                    rows={visibleRows}
                    rowKey={(row) =>
                      `${row.characterId}:${row.entry.date}:${row.entry.solarSystemId}`
                    }
                    label={t('miningTax.overviewTab')}
                    defaultSort={{ columnId: 'date', direction: 'desc' }}
                  />
                </div>
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}
