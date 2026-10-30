import { type ReactNode } from 'react';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import {
  DataTable,
  Panel,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import { StockStatusPill } from '@/features/stockTargets/StockStatus';
import type { StockStatus } from '@/engine/stockTargets/stockRows';
import { formatNumber } from '@/lib/numberLocale';
import { SAMPLE_CHARACTERS } from '@/storybook/sampleData';

/** Mock data and pieces shared by the three holder-character variants (#5594). */

interface Holder {
  id: number;
  name: string;
  qty: number;
}
const K = SAMPLE_CHARACTERS[0];
const O = SAMPLE_CHARACTERS[1];
const kestrel = (qty: number): Holder => ({ id: K.characterId, name: K.name, qty });
const orsa = (qty: number): Holder => ({ id: O.characterId, name: O.name, qty });

interface MockRow {
  id: number;
  name: string;
  group: string;
  target: number;
  listed: Holder[];
  ready: Holder[];
  status: StockStatus;
}
const sum = (hs: Holder[]) => hs.reduce((n, h) => n + h.qty, 0);

const ROWS: MockRow[] = [
  {
    id: 1,
    name: 'Hammerhead II',
    group: 'Drones',
    target: 50,
    listed: [],
    ready: [],
    status: 'out',
  },
  {
    id: 2,
    name: 'Warrior II',
    group: 'Drones',
    target: 100,
    listed: [],
    ready: [kestrel(40)],
    status: 'out',
  },
  {
    id: 3,
    name: 'Hobgoblin II',
    group: 'Drones',
    target: 60,
    listed: [orsa(12)],
    ready: [],
    status: 'low',
  },
  {
    id: 4,
    name: 'Damage Control II',
    group: 'Shield',
    target: 20,
    listed: [kestrel(4)],
    ready: [kestrel(12), orsa(8)],
    status: 'low',
  },
  {
    id: 5,
    name: 'Nanite Repair Paste',
    group: 'Ammo',
    target: 5000,
    listed: [kestrel(800), orsa(400)],
    ready: [orsa(2000)],
    status: 'low',
  },
  {
    id: 6,
    name: 'Medium Shield Extender II',
    group: 'Shield',
    target: 30,
    listed: [kestrel(31)],
    ready: [],
    status: 'ok',
  },
  {
    id: 7,
    name: 'Antimatter Charge S',
    group: 'Ammo',
    target: 20000,
    listed: [kestrel(20000), orsa(6000)],
    ready: [],
    status: 'over',
  },
];

const fmt = formatNumber;

/** New: a 16px portrait for inline use (CharacterAvatar's smallest box is 28px). */
function Mini({ id, alt }: { id: number; alt?: string }) {
  return (
    <span
      className="inline-flex shrink-0 align-middle [&>img]:size-4"
      data-new-component="HolderPortrait"
    >
      <CharacterAvatar characterId={id} size="sm" alt={alt} loading="lazy" />
    </span>
  );
}

function Stack({ holders }: { holders: Holder[] }) {
  return (
    <span className="inline-flex -space-x-1.5 align-middle">
      {holders.map((h) => (
        <Mini key={h.id} id={h.id} />
      ))}
    </span>
  );
}

function Breakdown({ holders, heading }: { holders: Holder[]; heading: string }) {
  return (
    <div className="flex min-w-48 flex-col gap-1 text-xs">
      <span className="text-text-dim">{heading}</span>
      {holders.map((h) => (
        <span key={h.id} className="flex items-center gap-2">
          <Mini id={h.id} />
          <span className="flex-1">{h.name}</span>
          <span className="tabular-nums">{fmt(h.qty)}</span>
        </span>
      ))}
    </div>
  );
}

/** Variant A: "40 · [portrait] Name" inline; several holders collapse to "2 characters" opening a popover. */
function InlineHolders({
  holders,
  heading,
  open,
}: {
  holders: Holder[];
  heading: string;
  open?: boolean;
}) {
  const n = sum(holders);
  if (holders.length === 0) return <span className="text-text-dim">0</span>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap tabular-nums">
      {fmt(n)}
      <span className="text-text-dim">·</span>
      {holders.length === 1 ? (
        <span className="inline-flex items-center gap-1 text-xs text-text-dim">
          <Mini id={holders[0].id} />
          <span className="max-sm:sr-only">{holders[0].name}</span>
        </span>
      ) : (
        <Popover defaultOpen={open}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <Stack holders={holders} />
              <span className="max-sm:sr-only">{holders.length} characters</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end">
            <Breakdown holders={holders} heading={heading} />
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

/** Variant B: the number stays bare; a portrait stack after it is the only addition, name and split on hover or tap. */
function StackHolders({
  holders,
  heading,
  open,
}: {
  holders: Holder[];
  heading: string;
  open?: boolean;
}) {
  const n = sum(holders);
  if (holders.length === 0) return <span className="text-text-dim">0</span>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
      {fmt(n)}
      {holders.length === 1 ? (
        <Tooltip content={holders[0].name} openOnTap>
          <span className="inline-flex">
            <Mini id={holders[0].id} />
          </span>
        </Tooltip>
      ) : (
        <Popover defaultOpen={open}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${holders.length} characters`}
              className="inline-flex"
            >
              <Stack holders={holders} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end">
            <Breakdown holders={holders} heading={heading} />
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

/** Variant C restock cell: names who lists it, nothing else changes. */
function RestockByHolder({ row }: { row: MockRow }) {
  const need = Math.max(0, row.target - sum(row.listed));
  const ready = Math.min(sum(row.ready), need);
  if (need === 0) return <span className="text-text-dim">—</span>;
  const one = row.ready.length === 1 ? row.ready[0] : null;
  return (
    <span className="sm:flex sm:flex-col">
      {ready > 0 && one && (
        <span className="text-accent sm:whitespace-nowrap">
          {one.qty >= need
            ? `${one.name.split(' ')[0]} can list all ${fmt(ready)}`
            : `${fmt(ready)} from ${one.name.split(' ')[0]}`}
        </span>
      )}
      {ready > 0 && !one && (
        <span className="text-accent sm:whitespace-nowrap">
          {fmt(ready)} from{' '}
          {row.ready.map((h) => `${h.name.split(' ')[0]} ${fmt(h.qty)}`).join(', ')}
        </span>
      )}
      {ready > 0 && need > ready && <span className="sm:hidden"> · </span>}
      {need > ready && (
        <span className="text-text-dim sm:whitespace-nowrap">{fmt(need - ready)} to source</span>
      )}
    </span>
  );
}

function plainRestock(row: MockRow) {
  const need = Math.max(0, row.target - sum(row.listed));
  const ready = Math.min(sum(row.ready), need);
  if (need === 0) return <span className="text-text-dim">—</span>;
  return (
    <span className="sm:flex sm:flex-col">
      {ready > 0 && (
        <span className="text-accent sm:whitespace-nowrap">{fmt(ready)} from hangar</span>
      )}
      {ready > 0 && need > ready && <span className="sm:hidden"> · </span>}
      {need > ready && (
        <span className="text-text-dim sm:whitespace-nowrap">{fmt(need - ready)} to source</span>
      )}
    </span>
  );
}

type Variant = 'A' | 'B' | 'C';

function columns(variant: Variant, openRow: number): DataTableColumn<MockRow>[] {
  const cell = (key: 'listed' | 'ready', row: MockRow) => {
    const holders = row[key];
    const heading = key === 'listed' ? 'Listed by' : 'Ready to list with';
    const open = row.id === openRow && key === 'ready';
    if (variant === 'A') return <InlineHolders holders={holders} heading={heading} open={open} />;
    if (variant === 'B') return <StackHolders holders={holders} heading={heading} open={open} />;
    const n = sum(holders);
    return n > 0 ? fmt(n) : <span className="text-text-dim">0</span>;
  };
  return [
    {
      id: 'item',
      header: 'Item',
      primary: true,
      render: (r) => (
        <>
          <span className="font-medium">{r.name}</span>
          <span className="hidden text-[0.6875rem] text-text-dim sm:block">{r.group}</span>
        </>
      ),
    },
    {
      id: 'target',
      header: 'Target',
      align: 'right',
      className: 'tabular-nums',
      headerCellClassName: 'sm:w-24',
      stackAffix: { before: 'target ' },
      render: (r) => fmt(r.target),
    },
    {
      id: 'listed',
      header: 'Listed',
      align: 'right',
      headerCellClassName: variant === 'A' ? 'sm:w-44' : 'sm:w-28',
      className: 'tabular-nums',
      stackAffix: { after: ' listed' },
      render: (r) => cell('listed', r),
    },
    {
      id: 'ready',
      header: 'Ready to list',
      align: 'right',
      headerCellClassName:
        variant === 'A' ? 'sm:w-48 whitespace-nowrap' : 'sm:w-32 whitespace-nowrap',
      className: 'tabular-nums',
      stackAffix: { after: ' ready' },
      render: (r) => cell('ready', r),
    },
    {
      id: 'restock',
      header: 'Restock',
      render: (r) => (variant === 'C' ? <RestockByHolder row={r} /> : plainRestock(r)),
    },
    {
      id: 'status',
      header: 'Status',
      headerCellClassName: 'sm:w-24',
      cardCorner: true,
      render: (r) => <StockStatusPill status={r.status} />,
    },
  ];
}

function ListingHere({ children }: { children: ReactNode }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-dim">
      {children}
    </p>
  );
}

function charTotals() {
  const m = new Map<number, { name: string; ready: number; listed: number }>();
  for (const r of ROWS)
    for (const [k, hs] of [
      ['ready', r.ready],
      ['listed', r.listed],
    ] as const)
      for (const h of hs) {
        const e = m.get(h.id) ?? { name: h.name, ready: 0, listed: 0 };
        e[k] += h.qty;
        m.set(h.id, e);
      }
  return [...m.entries()];
}

export function HolderMarketPage({ variant }: { variant: Variant }) {
  const totals = charTotals();
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4">
      <span className="self-start text-xs text-accent">‹ All markets</span>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">Dodixie Federation Navy hub restock</h2>
        <p className="text-xs text-text-dim">Station · Dodixie 0.9</p>
        {variant === 'A' && (
          <div className="mt-1" data-new-component="ListingHereLine">
            <ListingHere>
              <span>Listing here:</span>
              {totals.map(([id, t], i) => (
                <span key={id} className="inline-flex items-center gap-1">
                  <Mini id={id} />
                  {t.name}
                  {i < totals.length - 1 && ','}
                </span>
              ))}
            </ListingHere>
          </div>
        )}
        {variant === 'C' && (
          <div className="mt-1" data-new-component="HolderSummaryLine">
            <ListingHere>
              {totals.map(([id, t], i) => (
                <span key={id} className="inline-flex items-center gap-1">
                  <Mini id={id} />
                  <span className="text-text">{t.name}</span>
                  {fmt(t.listed)} listed · {fmt(t.ready)} ready
                  {i < totals.length - 1 && <span className="px-1">|</span>}
                </span>
              ))}
            </ListingHere>
          </div>
        )}
      </div>
      <Panel>
        <DataTable
          columns={columns(variant, 4)}
          rows={ROWS}
          rowKey={(r) => r.id}
          label="Stock list"
          stackLayout="dense"
        />
      </Panel>
    </div>
  );
}
