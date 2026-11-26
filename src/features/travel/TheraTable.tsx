import { ExternalLink } from '@/components/ui/ExternalLink';
import { useTranslation } from 'react-i18next';
import { SecurityStatus } from '@/components/SecurityStatus';
import { Button, DataTable, type DataTableColumn } from '@/components/ui';
import {
  canUseInRoute,
  jumpsSortValue,
  shipSizeRank,
  type TheraConnectionRow,
} from '@/engine/route/theraConnections';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { systemZkillUrl } from '@/lib/zkillboard';
import { formatNumber } from '@/lib/numberLocale';

const DASH = '—';
const DEFAULT_SORT = { columnId: 'jumps', direction: 'asc' } as const;

const hubBadgeClassName =
  'shrink-0 rounded-xs bg-panel-2 px-1 text-[0.6875rem] font-normal tracking-widest whitespace-nowrap text-text-dim uppercase';

function UseInRoute({
  row,
  onUse,
  className,
}: {
  row: TheraConnectionRow;
  onUse?: (row: TheraConnectionRow) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  if (onUse === undefined || !canUseInRoute(row)) return null;
  return (
    <Button
      size="sm"
      data-row-control
      className={className}
      onClick={() => onUse(row)}
      aria-label={t('travel.thera.useInRouteLabel', {
        hub: t(`travel.thera.hub.${row.hub}`),
        system: row.exitSystemName ?? DASH,
      })}
    >
      {t('travel.thera.useInRoute')}
    </Button>
  );
}

function useColumns(
  onUse?: (row: TheraConnectionRow) => void
): DataTableColumn<TheraConnectionRow>[] {
  'use memo';
  const { t } = useTranslation();
  return [
    {
      id: 'exit',
      header: t('travel.thera.col.exit'),
      headerClassName: 'whitespace-nowrap',
      primary: true,
      sortValue: (row) => row.exitSystemName ?? undefined,
      render: (row) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-semibold">{row.exitSystemName ?? DASH}</span>
          <span className={hubBadgeClassName}>{t(`travel.thera.hub.${row.hub}`)}</span>
        </span>
      ),
    },
    {
      id: 'security',
      header: t('travel.thera.col.security'),
      headerClassName: 'whitespace-nowrap',
      align: 'right',
      className: 'whitespace-nowrap',
      sortValue: (row) => row.exitSecurity ?? undefined,
      render: (row) =>
        row.exitSpace === 'wormhole' ? (
          <span className="font-semibold text-text-dim">
            {row.exitClass?.toUpperCase() ?? DASH}
          </span>
        ) : row.exitSecurity === null ? (
          <span data-dense-omit>{DASH}</span>
        ) : (
          <SecurityStatus security={row.exitSecurity} />
        ),
    },
    {
      id: 'region',
      header: t('travel.thera.col.region'),
      headerClassName: 'whitespace-nowrap',
      className: 'whitespace-nowrap text-text-dim',
      sortValue: (row) => row.exitRegionName ?? undefined,
      render: (row) => row.exitRegionName ?? <span data-dense-omit>{DASH}</span>,
    },
    {
      id: 'fits',
      header: t('travel.thera.col.fits'),
      headerClassName: 'whitespace-nowrap',
      className: 'whitespace-nowrap',
      stackAffix: { before: t('travel.thera.fitsAffix') },
      sortValue: (row) => (row.maxShipSize === null ? undefined : shipSizeRank(row.maxShipSize)),
      render: (row) =>
        row.maxShipSize === null ? (
          <span data-dense-omit>{DASH}</span>
        ) : (
          t(`travel.thera.size.${row.maxShipSize}`)
        ),
    },
    {
      id: 'life',
      header: t('travel.thera.col.life'),
      headerClassName: 'whitespace-nowrap',
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      stackAffix: { after: t('travel.thera.lifeAffix') },
      sortValue: (row) => row.remainingMs,
      render: (row) => (
        <span className={cx(row.lifeWarning && 'font-semibold text-warning')}>
          {formatCountdown(row.remainingMs / 1000)}
        </span>
      ),
    },
    {
      id: 'jumps',
      header: t('travel.thera.col.jumps'),
      headerClassName: 'whitespace-nowrap',
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      cardCorner: true,
      sortFirst: 'asc',
      sortValue: jumpsSortValue,
      render: (row) => <JumpsCell row={row} />,
    },
    {
      id: 'signature',
      header: t('travel.thera.col.signature'),
      headerClassName: 'whitespace-nowrap',
      className: 'w-0 pr-1 whitespace-nowrap',
      headerCellClassName: 'pr-1',
      stackEdge: 'below',
      render: (row) => (
        <span className="inline-flex items-center gap-3 max-sm:flex max-sm:w-full">
          <Signature row={row} />
          <UseInRoute row={row} onUse={onUse} />
        </span>
      ),
    },
  ];
}

function JumpsCell({ row }: { row: TheraConnectionRow }) {
  const { t } = useTranslation();
  switch (row.jumps.kind) {
    case 'known':
      return (
        <>
          {formatNumber(row.jumps.jumps)}
          <span className="sm:hidden">
            {' '}
            {t('travel.thera.jumpsUnit', { count: row.jumps.jumps })}
          </span>
        </>
      );
    case 'no-route':
      return <span className="font-normal text-text-dim">{t('travel.thera.noGateRoute')}</span>;
    case 'unknown':
    case 'no-origin':
      return DASH;
  }
}

function Signature({ row }: { row: TheraConnectionRow }) {
  return (
    <span
      data-row-control
      className="font-mono text-sm whitespace-nowrap tabular-nums max-sm:mr-auto"
    >
      <span className="select-all">{row.hubSignature ?? DASH}</span>
      <span className="text-text-dim sm:hidden"> → {row.exitSignature ?? DASH}</span>
    </span>
  );
}

function HoleDetail({
  row,
  onUse,
}: {
  row: TheraConnectionRow;
  onUse?: (row: TheraConnectionRow) => void;
}) {
  const { t } = useTranslation();
  const parts = [
    row.wormholeType === null ? null : (
      <span key="type">{t('travel.thera.detail.type', { type: row.wormholeType })}</span>
    ),
    <span key="signatures">
      {t('travel.thera.detail.signatures', {
        hubSignature: row.hubSignature ?? DASH,
        hub: t(`travel.thera.hub.${row.hub}`),
        exitSignature: row.exitSignature ?? DASH,
      })}
    </span>,
    <ExternalLink
      key="zkill"
      href={systemZkillUrl(row.exitSystemId)}
      aria-label={t('travel.zkillboardLabel', { system: row.exitSystemName ?? DASH })}
    >
      {t('travel.zkillboard')}
    </ExternalLink>,
    onUse === undefined || !canUseInRoute(row) ? null : (
      <UseInRoute key="use-in-route" row={row} onUse={onUse} />
    ),
  ].filter((part) => part !== null);
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      {parts.map((part, i) => (
        <span key={part.key} className="inline-flex items-baseline gap-x-2">
          {i > 0 && (
            <span aria-hidden="true" className="text-text-dim">
              ·
            </span>
          )}
          {part}
        </span>
      ))}
    </p>
  );
}

export function TheraTable({
  rows,
  label,
  onUse,
}: {
  rows: readonly TheraConnectionRow[];
  label: string;
  onUse?: (row: TheraConnectionRow) => void;
}) {
  'use memo';
  const columns = useColumns(onUse);
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      label={label}
      defaultSort={DEFAULT_SORT}
      density="compact"
      stackLayout="dense"
      mobileSort
      expandableRow={{
        leadingIcon: true,
        renderDetail: (row) => <HoleDetail row={row} onUse={onUse} />,
      }}
    />
  );
}
