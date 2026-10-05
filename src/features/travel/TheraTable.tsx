/**
 * Thera / Turnur's slim table of open holes (issue #2499): exit, security,
 * region, fits, life left and jumps, with the hub-side signature (select-all,
 * so one tap selects it to copy) in a narrow column. Clicking a row opens a line with the wormhole
 * type, both signatures and the exit's zKillboard page.
 *
 * Below `sm` each hole is one dense card (`DataTable`'s dense stack): exit and
 * hub badge with jumps on the right, then security, region, fits and life
 * left, then the signature pair with Route via at its right end.
 *
 * Route via (issue #2477): a K-space row with a gate route from the page's
 * origin links to Route Safety from that origin with the hole pinned for the
 * first leg — after the signature (and so on the phone card's signature
 * line), and on the expanded row.
 *
 * Conditions, never verdicts (decision `20260912-172628`).
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SecurityStatus } from '@/components/SecurityStatus';
import { DataTable, textActionClassName, type DataTableColumn } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import {
  jumpsSortValue,
  shipSizeRank,
  type TheraConnectionRow,
} from '@/engine/route/theraConnections';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { systemZkillUrl } from '@/lib/zkillboard';

const DASH = '—';
const DEFAULT_SORT = { columnId: 'jumps', direction: 'asc' } as const;

const hubBadgeClassName =
  'rounded-xs border border-line px-1 text-[0.625rem] font-normal tracking-widest text-text-dim uppercase';

/** Route Safety through a row's hole, or `null` for a row it is not offered on. */
type RouteViaHref = (row: TheraConnectionRow) => string | null;

/** Where Route via goes: only from a K-space exit a gate route reaches from the origin. */
function routeViaTarget(row: TheraConnectionRow, href?: RouteViaHref): string | null {
  return row.exitSpace !== 'wormhole' && row.jumps.kind === 'known' ? (href?.(row) ?? null) : null;
}

function RouteVia({
  row,
  href,
  className,
}: {
  row: TheraConnectionRow;
  href?: RouteViaHref;
  className?: string;
}) {
  const { t } = useTranslation();
  const to = routeViaTarget(row, href);
  if (to === null) return null;
  return (
    <Link
      to={to}
      data-row-control
      className={textActionClassName(cx('whitespace-nowrap', className))}
      aria-label={t('travel.thera.routeViaLabel', {
        hub: t(`travel.thera.hub.${row.hub}`),
        system: row.exitSystemName ?? DASH,
      })}
    >
      {t('travel.thera.routeVia')}
    </Link>
  );
}

function useColumns(routeVia?: RouteViaHref): DataTableColumn<TheraConnectionRow>[] {
  const { t } = useTranslation();
  return [
    {
      id: 'exit',
      header: t('travel.thera.col.exit'),
      headerClassName: 'whitespace-nowrap',
      primary: true,
      sortValue: (row) => row.exitSystemName ?? undefined,
      render: (row) => (
        <span className="inline-flex min-w-0 items-center gap-1.5">
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
      // On the span, not the cell: the phone card's meta line sets its own
      // dim colour on the cell.
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
      sortValue: jumpsSortValue,
      render: (row) => <JumpsCell row={row} />,
    },
    {
      id: 'signature',
      header: t('travel.thera.col.signature'),
      headerClassName: 'whitespace-nowrap',
      className: 'w-0 whitespace-nowrap',
      stackEdge: 'below',
      render: (row) => (
        <span className="inline-flex items-center gap-3 max-sm:flex max-sm:w-full">
          <Signature row={row} />
          {/* Its 44px tap target overhangs the phone card's line rather than
              heightening it, which left a gap over the signature. */}
          <RouteVia row={row} href={routeVia} className="max-sm:-my-2.5" />
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
          {row.jumps.jumps.toLocaleString()}
          {/* The card has no Jumps header to say what the bare number is. */}
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

/**
 * The hub-side signature, selected whole by one tap or click so it can be
 * copied by hand. On a phone card the exit-side signature follows it, so the
 * line reads as the pair.
 */
function Signature({ row }: { row: TheraConnectionRow }) {
  return (
    // A control of its own, so selecting the signature never opens the row.
    <span
      data-row-control
      className="font-mono text-sm whitespace-nowrap tabular-nums max-sm:mr-auto"
    >
      <span className="select-all">{row.hubSignature ?? DASH}</span>
      <span className="text-text-dim sm:hidden"> → {row.exitSignature ?? DASH}</span>
    </span>
  );
}

/** The expanded row: wormhole type, where to enter and leave, the exit's zKillboard page. */
function HoleDetail({ row, routeVia }: { row: TheraConnectionRow; routeVia?: RouteViaHref }) {
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
    <a
      key="zkill"
      href={systemZkillUrl(row.exitSystemId)}
      target="_blank"
      rel="noopener noreferrer"
      className={inlineLinkClassName}
      aria-label={t('travel.thera.detail.zkillboardLabel', { system: row.exitSystemName ?? DASH })}
    >
      {t('travel.thera.detail.zkillboard')}
    </a>,
    routeViaTarget(row, routeVia) === null ? null : (
      <RouteVia key="route-via" row={row} href={routeVia} />
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
  routeVia,
}: {
  /** Longest life first (`longestLifeFirst`): the stable jumps sort keeps it for ties. */
  rows: readonly TheraConnectionRow[];
  label: string;
  /** Route Safety through a row's hole; absent where there is no origin to route from. */
  routeVia?: RouteViaHref;
}) {
  const columns = useColumns(routeVia);
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
      expandableRow={{ renderDetail: (row) => <HoleDetail row={row} routeVia={routeVia} /> }}
    />
  );
}
