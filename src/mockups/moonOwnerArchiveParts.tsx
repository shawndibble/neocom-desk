import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  CollapsiblePanel,
  DataTable,
  IconButton,
  PageHeader,
  Panel,
  RowCaret,
  StatChip,
  StatChips,
  entityLinkClassName,
  textActionClassName,
  type DataTableColumn,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatNumber } from '@/lib/numberLocale';
import {
  EXTRACTIONS,
  HISTORY,
  MINED,
  OWNER,
  type ExtractionRow,
  type HistoryRow,
  type MinedRow,
  type Station,
} from './moonOwnerArchiveFixtures';

const isk = (n: number) => formatNumber(n);

function Crumb({ label }: { label: string }) {
  return (
    <Link to="#" className={cx(inlineLinkClassName, 'inline-flex items-center gap-1 text-xs')}>
      <Icon.Back size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      {label}
    </Link>
  );
}

export function OwnerFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 pt-4">
      <Crumb label="Moon owners" />
      <PageHeader title={OWNER} meta={<Pill tone="success">Active</Pill>} />
      <Panel>
        <StatChips>
          <StatChip label="Owed" value={isk(13_024_480)} />
          <StatChip label="Their rate" value="8%" />
          <StatChip label="Miner rate" value="12%" />
        </StatChips>
        <p className="mt-2 text-xs text-text-dim">
          Rates, payments and the rest of the page: unchanged.
        </p>
      </Panel>
      {children}
    </div>
  );
}

export type MinerLink = 'name' | 'row';

export function MinedPanel({ link }: { link: MinerLink }) {
  const cols: DataTableColumn<MinedRow>[] = [
    {
      id: 'miner',
      header: 'Character',
      primary: true,
      render: (m) =>
        link === 'name' ? (
          <Link to="#" className={entityLinkClassName()}>
            {m.miner}
          </Link>
        ) : (
          m.miner
        ),
      sortValue: (m) => m.miner,
    },
    { id: 'station', header: 'Refinery', render: (m) => m.station, sortValue: (m) => m.station },
    { id: 'ore', header: 'Ore', render: (m) => m.ore },
    {
      id: 'units',
      header: 'Units',
      align: 'right',
      className: 'tabular-nums',
      render: (m) => formatNumber(m.units),
      sortValue: (m) => m.units,
    },
    {
      id: 'value',
      header: 'Value (ISK)',
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (m) => isk(m.value),
      sortValue: (m) => m.value,
    },
    ...(link === 'row'
      ? [
          {
            id: 'go',
            header: '',
            align: 'right' as const,
            className: 'w-6 max-sm:hidden',
            render: () => <RowCaret />,
          },
        ]
      : []),
  ];
  return (
    <Panel title="Mined at their refineries" padded={false}>
      <DataTable
        label="Mined at their refineries"
        columns={cols}
        rows={MINED}
        rowKey={(m) => m.id}
        defaultSort={{ columnId: 'value', direction: 'desc' }}
        mobileSort
        stackColumns={2}
        {...(link === 'row' ? { onRowClick: () => undefined, rowHref: () => '#' } : {})}
      />
    </Panel>
  );
}

const stationMeta = (s: Station) =>
  `${s.moon} · ${s.extractions} Extractions · last mined ${s.lastMined}`;

export function OfferPill({ s }: { s: Station }) {
  if (s.offer === null) return null;
  return (
    <Pill tone="warning">
      {s.offer === 'gone' ? 'Gone in the game' : `No Extraction in ${s.idleDays} days`}
    </Pill>
  );
}

export type ArchiveControl = 'detail' | 'row';

function StationRow({
  s,
  control,
  archived,
}: {
  s: Station;
  control: ArchiveControl;
  archived?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <div className="min-w-0 flex-1 basis-56">
        <span className="flex min-w-0 items-center gap-1 text-sm">
          <Link to="#" className={cx(entityLinkClassName(), '[overflow-wrap:anywhere]')}>
            {s.name}
          </Link>
          {!archived && (
            <IconButton
              size="row"
              variant="plain"
              icon={<Icon.Rename size={Icon.ICON_SIZE.sm} className="text-text-faint" />}
              label={`Edit the label for ${s.name}`}
              tooltip="Edit label"
            />
          )}
        </span>
        <p className="text-xs text-text-dim">
          {archived
            ? `Archived ${s.archivedOn} by ${s.archivedBy} · ${s.archivedWhy} · ${s.moon}`
            : stationMeta(s)}
        </p>
      </div>
      {!archived && <OfferPill s={s} />}
      {!archived && control === 'row' && s.offer !== null && (
        <button type="button" className={textActionClassName('whitespace-nowrap')}>
          Archive
        </button>
      )}
      {archived && (
        <Button size="sm" variant="ghost">
          <Icon.Revert size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          Restore
        </Button>
      )}
    </li>
  );
}

export function RefineriesPanel({
  stations,
  control,
}: {
  stations: Station[];
  control: ArchiveControl;
}) {
  return (
    <Panel title="Refineries" padded={false}>
      <ul className="divide-y divide-line">
        {stations.map((s) => (
          <StationRow key={s.id} s={s} control={control} />
        ))}
      </ul>
    </Panel>
  );
}

export function ArchivedSection({
  stations,
  expanded = true,
}: {
  stations: Station[];
  expanded?: boolean;
}) {
  const [open, setOpen] = useState(expanded);
  return (
    <CollapsiblePanel
      title={`Archived (${stations.length})`}
      expanded={open}
      onToggle={() => setOpen((v) => !v)}
      labels={{ show: 'Show archived refineries', hide: 'Hide archived refineries' }}
      padded={false}
    >
      {stations.length === 0 ? (
        <p className="p-3 text-sm text-text-dim">
          Nothing archived. Archive a refinery from its page once it is gone from the game; its
          records stay.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {stations.map((s) => (
            <StationRow key={s.id} s={s} control="detail" archived />
          ))}
        </ul>
      )}
    </CollapsiblePanel>
  );
}

const STATE_TONE = { Ready: 'accent', Fractured: 'success', Expired: 'neutral' } as const;

const extractionCols: DataTableColumn<ExtractionRow>[] = [
  { id: 'pop', header: 'Popped', primary: true, render: (e) => e.popped, sortValue: (e) => e.id },
  {
    id: 'state',
    header: 'State',
    render: (e) => (
      <span className="flex flex-col items-start gap-0.5">
        <Pill tone={STATE_TONE[e.state]} className="whitespace-nowrap">
          {e.state}
        </Pill>
        {e.fullyMined && <span className="text-xs text-text-dim">Fully mined</span>}
      </span>
    ),
  },
  { id: 'ore', header: 'Ore make-up', render: (e) => e.ore },
  {
    id: 'isk',
    header: 'Est. value (ISK)',
    align: 'right',
    className: 'tabular-nums',
    cardCorner: true,
    render: (e) => isk(e.estIsk),
    sortValue: (e) => e.estIsk,
  },
];

const historyCols: DataTableColumn<HistoryRow>[] = [
  { id: 'month', header: 'Month', primary: true, render: (h) => h.month, sortValue: (h) => h.id },
  {
    id: 'miners',
    header: 'Miners',
    align: 'right',
    className: 'tabular-nums',
    render: (h) => h.miners,
  },
  {
    id: 'units',
    header: 'Units',
    align: 'right',
    className: 'tabular-nums',
    render: (h) => formatNumber(h.units),
  },
  {
    id: 'value',
    header: 'Value (ISK)',
    align: 'right',
    className: 'tabular-nums',
    cardCorner: true,
    render: (h) => isk(h.value),
  },
];

export function StationDetail({ s, archived }: { s: Station; archived?: boolean }) {
  const offered = s.offer !== null && !archived;
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 pt-4">
      <Crumb label={OWNER} />
      <PageHeader
        title={s.name}
        meta={
          archived ? (
            <Pill>Archived</Pill>
          ) : (
            <IconButton
              size="row"
              variant="plain"
              icon={<Icon.Rename size={Icon.ICON_SIZE.sm} className="text-text-faint" />}
              label={`Edit the label for ${s.name}`}
              tooltip="Edit label"
            />
          )
        }
        actions={
          archived ? (
            <Button>
              <Icon.Revert size={Icon.ICON_SIZE.sm} aria-hidden="true" />
              Restore
            </Button>
          ) : (
            <Button variant={offered ? 'accent' : 'ghost'}>Archive</Button>
          )
        }
      />
      {offered && (
        <Panel>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="min-w-0 flex-1 basis-64 text-sm">
              {s.offer === 'gone'
                ? 'The game no longer shows this structure. Archive it to take it off the list. Everything stays.'
                : `No Extraction in ${s.idleDays} days and no mining since ${s.lastMined}. If it is gone, archive it. Everything stays.`}
            </p>
            <OfferPill s={s} />
          </div>
        </Panel>
      )}
      {archived && (
        <Panel>
          <p className="text-sm">
            Archived {s.archivedOn} by {s.archivedBy} ({s.archivedWhy}). It is off the Refineries
            list. Its Extractions, mining and label are all still here. Restore brings it back.
          </p>
        </Panel>
      )}
      <Panel>
        <StatChips>
          <StatChip
            label="Moon"
            value={
              <Link to="#" className={entityLinkClassName()}>
                {s.moon}
              </Link>
            }
          />
          <StatChip label="Extractions" value={String(s.extractions)} />
          <StatChip label="Last Extraction" value={s.lastExtraction} />
          <StatChip label="Mined" value={`${isk(s.mined)} ISK`} />
        </StatChips>
      </Panel>
      <Panel title="Extractions" padded={false}>
        <DataTable
          label="Extractions"
          columns={extractionCols}
          rows={EXTRACTIONS}
          rowKey={(e) => e.id}
          defaultSort={{ columnId: 'pop', direction: 'desc' }}
          mobileSort
          stackColumns={2}
        />
      </Panel>
      <Panel title="Mining history" padded={false}>
        <DataTable
          label="Mining history"
          columns={historyCols}
          rows={HISTORY}
          rowKey={(h) => h.id}
          defaultSort={{ columnId: 'month', direction: 'desc' }}
          mobileSort
          stackColumns={2}
        />
      </Panel>
    </div>
  );
}
