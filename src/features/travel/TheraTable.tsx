/**
 * Thera / Turnur's slim table of open holes (issue #2499): exit, security,
 * region, fits, life left and jumps, with the hub-side signature's Copy button
 * in a narrow action column. Clicking a row opens a line with the wormhole
 * type, both signatures and the exit's zKillboard page.
 *
 * Below `sm` each hole is one dense card (`DataTable`'s dense stack): exit and
 * hub badge with jumps on the right, then security, region, fits and life
 * left, then the signature pair and Copy on a line of their own.
 *
 * Route via (issue #2477): a K-space row with a gate route from the page's
 * origin links to Route Safety from that origin with the hole pinned for the
 * first leg — after Copy in the action cell (and so on the phone card's
 * signature line), and on the expanded row.
 *
 * Conditions, never verdicts (decision `20260912-172628`).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SecurityStatus } from '@/components/SecurityStatus';
import { Button, DataTable, textActionClassName, type DataTableColumn } from '@/components/ui';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import {
  jumpsSortValue,
  shipSizeRank,
  type TheraConnectionRow,
} from '@/engine/route/theraConnections';
import { writeToClipboard } from '@/lib/clipboard';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { systemZkillUrl } from '@/lib/zkillboard';

const DASH = '—';
const COPIED_MS = 1500;
const DEFAULT_SORT = { columnId: 'jumps', direction: 'asc' } as const;

const hubBadgeClassName =
  'rounded-xs border border-line px-1 text-[0.625rem] font-normal tracking-widest text-text-dim uppercase';

/** Route Safety through a row's hole, or `null` for a row it is not offered on. */
type RouteViaHref = (row: TheraConnectionRow) => string | null;

/** Where Route via goes: only from a K-space exit a gate route reaches from the origin. */
function routeViaTarget(row: TheraConnectionRow, href?: RouteViaHref): string | null {
  return row.exitSpace !== 'wormhole' && row.jumps.kind === 'known' ? (href?.(row) ?? null) : null;
}

function RouteVia({ row, href }: { row: TheraConnectionRow; href?: RouteViaHref }) {
  const { t } = useTranslation();
  const to = routeViaTarget(row, href);
  if (to === null) return null;
  return (
    <Link
      to={to}
      data-row-control
      className={textActionClassName('whitespace-nowrap')}
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
      className: 'whitespace-nowrap text-text-dim',
      sortValue: (row) => row.exitRegionName ?? undefined,
      render: (row) => row.exitRegionName ?? <span data-dense-omit>{DASH}</span>,
    },
    {
      id: 'fits',
      header: t('travel.thera.col.fits'),
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
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      cardCorner: true,
      sortValue: jumpsSortValue,
      render: (row) => <JumpsCell row={row} />,
    },
    {
      id: 'copy',
      header: t('travel.thera.col.signature'),
      className: 'w-0 whitespace-nowrap',
      stackEdge: 'below',
      render: (row) => (
        <span className="inline-flex items-center gap-3 max-sm:flex max-sm:w-full max-sm:flex-wrap">
          <SignatureCopy row={row} />
          <RouteVia row={row} href={routeVia} />
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
 * The hub-side signature and its Copy button; a refused clipboard selects the
 * signature instead. On a phone card the exit-side signature follows it, so
 * the line reads as the pair.
 */
function SignatureCopy({ row }: { row: TheraConnectionRow }) {
  const { t } = useTranslation();
  const signatureRef = useRef<HTMLSpanElement>(null);
  const [copied, setCopied] = useState(false);
  const signature = row.hubSignature;
  const names = {
    hub: t(`travel.thera.hub.${row.hub}`),
    system: row.exitSystemName ?? DASH,
  };

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyLabel = copied
    ? t('travel.thera.copiedSignature', names)
    : t('travel.thera.copySignature', names);

  async function copy() {
    if (signature === null) return;
    try {
      await writeToClipboard(signature);
      setCopied(true);
    } catch {
      // No clipboard (permission, insecure context): select the signature so
      // the pilot can copy it by hand.
      const node = signatureRef.current;
      if (node) window.getSelection()?.selectAllChildren(node);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5 max-sm:flex max-sm:w-full">
      <Button
        size="sm"
        className="max-sm:order-last max-sm:ml-auto"
        disabled={signature === null}
        onClick={() => void copy()}
        aria-label={copyLabel}
        // Above `sm` the button is the icon alone; the tooltip names it.
        title={copyLabel}
      >
        {copied ? (
          <Icon.Done size={Icon.ICON_SIZE.sm} />
        ) : (
          <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} />
        )}
        <span className="sm:hidden">
          {copied ? t('travel.thera.copied') : t('travel.thera.copy')}
        </span>
      </Button>
      {/* A control of its own, so selecting the signature by hand never
          opens the row. */}
      <span data-row-control className="font-mono text-sm tabular-nums">
        <span ref={signatureRef} className="select-all">
          {signature ?? DASH}
        </span>
        <span className="text-text-dim sm:hidden"> → {row.exitSignature ?? DASH}</span>
      </span>
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
