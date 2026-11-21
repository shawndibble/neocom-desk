import { useState } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CollapsiblePanel,
  DataTable,
  FilterChip,
  Panel,
  ProgressBar,
  RowCaret,
  entityLinkClassName,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import type { RefineryMiner } from '@/engine/corpTaxBook/refineryDocs';
import { formatCount } from '@/lib/formatCount';
import { useIsPhone } from '@/lib/useIsPhone';
import { FILTER_STATES } from './extractionStates';
import { atDate, isk, shortDateTime } from './moonsFormat';
import { minerPath } from './moonsPaths';
import { OreLine, StateWord } from './moonsParts';
import { useBook } from './useBook';

const kp = (key: string) => `corpTaxBook.moons.refineryPage.${key}`;
const NONE = <span className="text-text-dim">—</span>;

/** An Extraction's row with what its moon doc says was mined in its window. */
export interface PullRow {
  row: ExtractionRow;
  /** The ISK value of the ore mined in the window; null when no doc says. */
  minedIsk: number | null;
}

/** The newest Extraction's chunk and where its make-up came from. Never guessed. */
export function OrePanel({
  row,
  priceOf,
}: {
  row: ExtractionRow;
  priceOf: (id: number) => number;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { names } = useBook();
  if (row.oreSource === 'unknown' || row.oreLines.length === 0) {
    return (
      <Panel title={t(kp('ore.title'))}>
        <p className="inline-flex items-start gap-1.5 text-sm">
          <Icon.Warn
            size={Icon.ICON_SIZE.sm}
            className="mt-0.5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <span>
            <span className="text-warning">{t(kp('ore.unknown'))}</span>{' '}
            {t(kp('ore.unknownWhy'), { date: atDate(row.startedAt, zone) })}
          </span>
        </p>
      </Panel>
    );
  }
  const units = row.oreLines.reduce((sum, l) => sum + l.quantity, 0);
  const columns: DataTableColumn<ExtractionRow['oreLines'][number]>[] = [
    {
      id: 'ore',
      header: t(kp('ore.cols.ore')),
      primary: true,
      stickyStart: true,
      render: (l) => names.ore(l.typeId),
    },
    {
      id: 'share',
      header: t(kp('ore.cols.share')),
      render: (l) => {
        const pct = Math.round((l.quantity / units) * 100);
        return (
          <span className="flex items-center gap-2">
            <span className="w-9 text-right tabular-nums">{pct}%</span>
            <ProgressBar
              label={t(kp('ore.shareOf'), { ore: names.ore(l.typeId) })}
              value={pct}
              max={100}
              size="xs"
              className="w-24"
            />
          </span>
        );
      },
    },
    {
      id: 'units',
      header: t(kp('ore.cols.units')),
      align: 'right',
      className: 'tabular-nums',
      phoneHidden: true,
      render: (l) => formatCount(l.quantity),
    },
    {
      id: 'value',
      header: t(kp('ore.cols.value')),
      align: 'right',
      className: 'tabular-nums',
      render: (l) => isk(l.quantity * priceOf(l.typeId)),
    },
  ];
  return (
    <Panel
      title={t(kp('ore.title'))}
      meta={
        <span className="text-xs text-text-dim">
          {t(
            kp(
              `ore.source.${row.oreSource === 'survey' && row.oreCorrected ? 'surveyCorrected' : row.oreSource}`
            )
          )}{' '}
          · {atDate(row.startedAt, zone)}
        </span>
      }
      wrapMeta
      padded={false}
    >
      <DataTable
        label={t(kp('ore.title'))}
        columns={columns}
        rows={row.oreLines}
        rowKey={(l) => String(l.typeId)}
        density="compact"
        responsive="table"
      />
    </Panel>
  );
}

function MinedCell({ pull }: { pull: PullRow }) {
  const { t } = useTranslation();
  const { row, minedIsk } = pull;
  if (row.minedPct === null)
    return minedIsk ? (
      <span className="block text-xs tabular-nums">
        {t(kp('ext.minedIsk'), { isk: isk(minedIsk) })}
      </span>
    ) : (
      NONE
    );
  return (
    <span className="block min-w-28">
      <span className="text-xs tabular-nums">
        {t(kp('ext.minedPct'), { pct: row.minedPct, isk: isk(minedIsk ?? 0) })}
      </span>
      <ProgressBar
        label={t(kp('ext.mined'))}
        value={row.minedPct}
        max={100}
        size="xs"
        className="mt-1"
      />
      {row.fullyMined && (
        <span className="block text-xs text-text-dim">{t(kp('ext.fullyMined'))}</span>
      )}
    </span>
  );
}

/** Every Extraction, future and past; a row opens its Extraction page. */
export function ExtractionsPanel({
  pulls,
  onOpen,
}: {
  pulls: readonly PullRow[];
  onOpen: (id: string) => void;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const shown = pulls.filter((p) => !off.has(p.row.state));
  const toggle = (state: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (!next.delete(state)) next.add(state);
      return next;
    });
  const columns: DataTableColumn<PullRow>[] = [
    {
      id: 'state',
      header: t('corpTaxBook.moons.cols.state'),
      primary: true,
      render: ({ row }) => (
        <span className="block">
          <StateWord state={row.state} />
          <span className="block text-xs text-text-dim">
            {t('corpTaxBook.moons.startedOn', { date: atDate(row.startedAt, zone) })}
          </span>
        </span>
      ),
      sortValue: ({ row }) => row.startedAt,
    },
    {
      id: 'pop',
      header: t('corpTaxBook.moons.cols.pop'),
      render: ({ row }) => shortDateTime(row.chunkArrivalAt, zone),
      sortValue: ({ row }) => row.chunkArrivalAt,
    },
    {
      id: 'fractured',
      header: t('corpTaxBook.moons.cols.fractured'),
      render: ({ row }) =>
        row.fracturedAt ? (
          <span className="block">
            {shortDateTime(row.fracturedAt, zone)}
            {row.fracturedBy && (
              <span className="block text-xs text-text-dim">
                {t(`corpTaxBook.moons.moons.by.${row.fracturedBy}`)}
              </span>
            )}
          </span>
        ) : row.state === 'cancelled' ? (
          <span className="text-text-dim">{t('corpTaxBook.moons.state.cancelled')}</span>
        ) : (
          NONE
        ),
      sortValue: ({ row }) => row.fracturedAt,
    },
    {
      id: 'ore',
      header: t('corpTaxBook.moons.refinery.cols.ore'),
      render: ({ row }) => <OreLine row={row} />,
    },
    {
      id: 'mined',
      header: t('corpTaxBook.moons.cols.minedShort'),
      render: (pull) => <MinedCell pull={pull} />,
      sortValue: ({ minedIsk }) => minedIsk ?? undefined,
    },
    {
      id: 'miners',
      header: t('corpTaxBook.moons.cols.miners'),
      align: 'right',
      className: 'tabular-nums',
      render: ({ row }) => (row.minerCount ? row.minerCount : NONE),
      sortValue: ({ row }) => row.minerCount,
    },
    {
      id: 'tax',
      header: t(kp('ext.tax')),
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: ({ row }) =>
        row.tax ? (
          isk(row.tax)
        ) : row.minerCount ? (
          <span className="text-text-dim">{t(kp('ext.notBilled'))}</span>
        ) : (
          NONE
        ),
      sortValue: ({ row }) => row.tax,
    },
    {
      id: 'go',
      header: '',
      align: 'right',
      className: 'w-6 max-sm:hidden',
      render: () => <RowCaret />,
    },
  ];
  return (
    <Panel title={t(kp('ext.title'), { count: pulls.length })} padded={false}>
      {pulls.length === 0 ? (
        <p className="p-3 text-sm text-text-dim">
          {t('corpTaxBook.moons.refinery.extractionsNone')}
        </p>
      ) : (
        <>
          {pulls.length > 1 && (
            <div role="group" aria-label={t(kp('ext.show'))} className="flex flex-wrap gap-2 p-3">
              {FILTER_STATES.map((state) => {
                const count = pulls.filter((p) => p.row.state === state).length;
                return (
                  <FilterChip
                    key={state}
                    label={t(`corpTaxBook.moons.state.${state}`)}
                    count={count}
                    countLabel={t(kp('ext.chipCount'), { count })}
                    selected={!off.has(state)}
                    onToggle={() => toggle(state)}
                  />
                );
              })}
            </div>
          )}
          <div className="overflow-x-auto">
            <DataTable
              label={t(kp('ext.label'))}
              columns={columns}
              rows={shown}
              rowKey={({ row }) => row.id}
              density="compact"
              onRowClick={({ row }) => onOpen(row.id)}
              defaultSort={{ columnId: 'state', direction: 'desc' }}
              mobileSort
              stackColumns={2}
            />
          </div>
        </>
      )}
    </Panel>
  );
}

/** Every Miner who mined here, all of them, biggest first. Folds on a phone; never pages. */
export function MinersPanel({
  miners,
  pulled,
  nameOf,
  nextPop,
}: {
  miners: readonly RefineryMiner[];
  /** Extractions with anyone mining: the "of N" under a Miner's count. */
  pulled: number;
  nameOf: (minerId: string) => string;
  nextPop: string | undefined;
}) {
  const zone = useTimeZone();
  const { t } = useTranslation();
  const phone = useIsPhone();
  const [open, setOpen] = useState(true);
  if (miners.length === 0) {
    return (
      <Panel title={t(kp('miners.title'), { count: 0 })}>
        <p className="text-sm text-text-dim">
          {nextPop
            ? t(kp('miners.noneYet'), { date: shortDateTime(nextPop, zone) })
            : t(kp('miners.none'))}
        </p>
      </Panel>
    );
  }
  const total = miners.reduce((sum, m) => sum + m.isk, 0);
  const columns: DataTableColumn<RefineryMiner>[] = [
    {
      id: 'miner',
      header: t('corpTaxBook.moons.cols.miner'),
      primary: true,
      stickyStart: true,
      render: (m) => (
        <Link to={minerPath(m.minerId)} className={entityLinkClassName()}>
          {nameOf(m.minerId)}
        </Link>
      ),
      sortValue: (m) => nameOf(m.minerId),
    },
    {
      id: 'pulls',
      header: t(kp('miners.cols.pulls')),
      align: 'right',
      className: 'tabular-nums',
      phoneHidden: true,
      render: (m) => t(kp('miners.pullsOf'), { count: m.pulls, of: pulled }),
      sortValue: (m) => m.pulls,
    },
    {
      id: 'last',
      header: t(kp('miners.cols.last')),
      phoneHidden: true,
      render: (m) => atDate(m.lastPopAt, zone),
      sortValue: (m) => m.lastPopAt,
    },
    {
      id: 'share',
      header: t(kp('miners.cols.share')),
      align: 'right',
      className: 'tabular-nums',
      render: (m) => `${total > 0 ? ((m.isk / total) * 100).toFixed(1) : '0.0'}%`,
      sortValue: (m) => m.isk,
    },
    {
      id: 'isk',
      header: t(kp('miners.cols.mined')),
      align: 'right',
      className: 'tabular-nums',
      render: (m) => isk(m.isk),
      sortValue: (m) => m.isk,
    },
  ];
  return (
    <CollapsiblePanel
      title={t(kp('miners.title'), { count: miners.length })}
      meta={<span className="text-xs text-text-dim">{t(kp('miners.meta'))}</span>}
      wrapMeta
      expanded={open}
      onToggle={() => setOpen((v) => !v)}
      labels={{ show: t(kp('miners.show')), hide: t(kp('miners.hide')) }}
      collapsible={phone}
      collapsedSummary={
        <p className="px-3 py-2 text-sm text-text-dim tabular-nums">
          {t(kp('miners.summary'), { count: miners.length, isk: isk(total) })}
        </p>
      }
      padded={false}
    >
      <DataTable
        label={t(kp('miners.label'))}
        columns={columns}
        rows={miners as RefineryMiner[]}
        rowKey={(m) => m.minerId}
        density="compact"
        defaultSort={{ columnId: 'isk', direction: 'desc' }}
        responsive="table"
      />
      <p className="border-t border-line px-3 py-2 text-xs text-text-dim">{t(kp('miners.foot'))}</p>
    </CollapsiblePanel>
  );
}
