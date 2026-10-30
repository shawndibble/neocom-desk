/**
 * Parts of the Appraisal live-price progress mockups (#5591). The page frame
 * repeats today's Appraisal (header with Refresh, paste card, summary, result
 * table) with sample data; only the live-price status, the row marks and the
 * Compare Hubs progress are new.
 */
import type { ReactNode } from 'react';
import {
  Button,
  DataTable,
  IconButton,
  PageHeader,
  Panel,
  ProgressBar,
  StatChip,
  Tabs,
  TextArea,
  type DataTableColumn,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { formatCount } from '@/lib/formatCount';
import { formatIskCompact } from '@/lib/isk';

export type PriceState = 'live' | 'cached' | 'failed';
export type Variant = 'today' | 'a' | 'b' | 'c';
export type Scene = 'progress' | 'done' | 'compare';

interface SampleRow {
  typeId: number;
  name: string;
  qty: number;
  buy: number;
  sell: number;
}

/** Most valuable first: the order rows go live. */
const ROWS: readonly SampleRow[] = [
  {
    typeId: 1,
    name: 'Gist X-Type 500MN Microwarpdrive',
    qty: 2,
    buy: 61_200_000,
    sell: 66_900_000,
  },
  { typeId: 2, name: 'Damage Control II', qty: 14, buy: 2_940_000, sell: 3_310_000 },
  { typeId: 3, name: 'Large Shield Extender II', qty: 20, buy: 1_102_000, sell: 1_289_000 },
  { typeId: 4, name: 'Caldari Navy Antimatter Charge M', qty: 9_000, buy: 4_100, sell: 4_960 },
  { typeId: 5, name: 'Nanite Repair Paste', qty: 3_200, buy: 11_800, sell: 13_450 },
  { typeId: 6, name: 'Hobgoblin II', qty: 25, buy: 118_000, sell: 139_000 },
  { typeId: 7, name: 'Pyerite', qty: 1_240_000, buy: 8.9, sell: 10.4 },
  { typeId: 8, name: 'Tritanium', qty: 4_800_000, buy: 4.6, sell: 5.2 },
];

/** Row states per scene: the top rows are live, the rest cached, one lookup failed. */
function stateFor(index: number, scene: Scene): PriceState {
  if (index === 6) return 'failed';
  if (scene !== 'progress') return 'live';
  return index < 4 ? 'live' : 'cached';
}

const FRESH = 'text-text';

function Price({ value, state, variant }: { value: number; state: PriceState; variant: Variant }) {
  const text = value < 100 ? value.toFixed(2) : formatIskCompact(value);
  if (variant === 'today' || state === 'live') return <span className={FRESH}>{text}</span>;
  const dim = 'text-text-dim';
  if (variant === 'a')
    return (
      <span className={dim}>
        {text}
        <span className="ml-1.5 text-[0.625rem] uppercase tracking-wide">
          {state === 'cached' ? 'cached' : 'Fuzzwork'}
        </span>
      </span>
    );
  if (variant === 'b')
    return (
      <span
        className={cx('inline-flex items-center gap-1', state === 'failed' ? 'text-warning' : dim)}
      >
        {state === 'cached' ? (
          <Icon.Recent size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        ) : (
          <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        )}
        <span className="sr-only">{state === 'cached' ? 'cached price' : 'Fuzzwork price'}</span>
        {text}
      </span>
    );
  // c: the word sits in the Item cell, the price just dims.
  return <span className={dim}>{text}</span>;
}

function columns(scene: Scene, variant: Variant): DataTableColumn<SampleRow & { index: number }>[] {
  const st = (row: { index: number }) => stateFor(row.index, scene);
  return [
    {
      id: 'item',
      header: 'Item',
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          <span>{r.name}</span>
          {variant === 'c' && st(r) !== 'live' && (
            <span
              className={cx(
                'rounded-xs border px-1 text-[0.625rem] uppercase tracking-wide',
                st(r) === 'failed' ? 'border-warning text-warning' : 'border-line text-text-dim'
              )}
            >
              {st(r) === 'cached' ? 'cached' : 'Fuzzwork'}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'qty',
      header: 'Qty',
      align: 'right',
      className: 'tabular-nums',
      sortValue: (r) => r.qty,
      render: (r) => formatCount(r.qty),
    },
    {
      id: 'buy',
      header: 'Buy',
      align: 'right',
      className: 'tabular-nums',
      sortValue: (r) => r.buy,
      render: (r) => <Price value={r.buy} state={st(r)} variant={variant} />,
    },
    {
      id: 'sell',
      header: 'Sell',
      align: 'right',
      className: 'tabular-nums',
      sortValue: (r) => r.sell,
      render: (r) => <Price value={r.sell} state={st(r)} variant={variant} />,
    },
  ];
}

/** The new status: text plus a thin bar while rows go live, then the one-line age. */
function StatusText({ done, count, total }: { done: boolean; count: number; total: number }) {
  return done ? (
    <span className="text-xs text-text-dim">Live prices · checked 14 s ago</span>
  ) : (
    <span className="text-xs text-text-dim tabular-nums" role="status">
      Checking live prices {count} / {total}
    </span>
  );
}

function StatusBar({
  count,
  total,
  className,
}: {
  count: number;
  total: number;
  className?: string;
}) {
  return (
    <ProgressBar
      label="Live prices checked"
      value={count}
      max={total}
      size="xs"
      className={className}
    />
  );
}

interface FrameProps {
  variant: Variant;
  scene: Scene;
}

const PROGRESS = { count: 23, total: 60 } as const;
const COMPARE_PROGRESS = { count: 87, total: 240 } as const;

function HubCards({ variant }: { variant: Variant }) {
  const hubs = [
    { name: 'Jita', total: '1.82B', loaded: true },
    { name: 'Amarr', total: '1.91B', loaded: true },
    { name: 'Dodixie', total: null, loaded: false },
    { name: 'Rens', total: null, loaded: false },
    { name: 'Hek', total: null, loaded: false },
  ];
  const { count, total } = COMPARE_PROGRESS;
  const status =
    variant === 'today' ? null : variant === 'c' ? (
      <div className="flex items-center gap-2">
        <StatusText done={false} count={count} total={total} />
        <StatusBar count={count} total={total} className="w-24" />
      </div>
    ) : (
      <div className="flex flex-col gap-1">
        <StatusText done={false} count={count} total={total} />
        {variant === 'a' && <StatusBar count={count} total={total} />}
      </div>
    );
  return (
    <div className="relative flex flex-col gap-2">
      {variant === 'b' && (
        <StatusBar count={count} total={total} className="absolute inset-x-0 -top-2" />
      )}
      {status}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {hubs.map((h) => (
          <div key={h.name} className="rounded-xs border border-line bg-panel/85 px-3 py-2">
            <div className="text-xs font-medium">{h.name}</div>
            <div className="text-sm tabular-nums">
              {h.loaded ? h.total : <span className="text-text-dim">…</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultPanel({ variant, scene }: FrameProps) {
  const done = scene !== 'progress';
  const { count, total } = PROGRESS;
  const rows = ROWS.map((r, index) => ({ ...r, index }));
  const status =
    variant === 'today' ? null : variant === 'c' && !done ? (
      <span className="flex items-center gap-2">
        <StatusText done={false} count={count} total={total} />
        <StatusBar count={count} total={total} className="w-24" />
      </span>
    ) : (
      <StatusText done={done} count={count} total={total} />
    );
  const meta = (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="max-md:hidden">
        <StatChip label="Jita" value="at 100%" />
      </span>
      {status}
    </span>
  );
  return (
    <div className="relative">
      {variant === 'b' && !done && (
        <StatusBar count={count} total={total} className="absolute inset-x-0 top-0 z-10" />
      )}
      <Panel title="Result" meta={meta} wrapMeta padded={false}>
        {variant === 'a' && !done && (
          <div className="border-b border-line px-3 py-1.5">
            <StatusBar count={count} total={total} />
          </div>
        )}
        <div className="min-w-0 overflow-x-auto">
          <DataTable
            columns={columns(scene, variant)}
            rows={rows}
            rowKey={(r) => r.typeId}
            label="Result"
            responsive="table"
            className="pb-1"
          />
        </div>
      </Panel>
    </div>
  );
}

export function AppraisalLiveMockup({ variant, scene }: FrameProps): ReactNode {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4">
      <PageHeader
        title="Market"
        actions={
          <IconButton
            icon={<Icon.Refresh />}
            label="Refresh"
            disabled={variant !== 'today' && scene === 'progress'}
          />
        }
      />
      <Tabs
        label="Market sections"
        tabsId="mockup-market"
        value="appraisal"
        onChange={() => {}}
        tabs={[
          { id: 'browser', label: 'Market' },
          { id: 'orders', label: 'Open' },
          { id: 'stock', label: 'Stock' },
          { id: 'history', label: 'History' },
          { id: 'appraisal', label: 'Appraisal' },
        ]}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start xl:grid-cols-[18rem_minmax(0,1fr)]">
        <Panel title="Paste">
          <div className="flex flex-col gap-3">
            <TextArea
              aria-label="Items"
              rows={6}
              mono
              className="text-[0.6875rem]"
              defaultValue={'Tritanium\t4800000\nPyerite\t1240000'}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary">Appraise</Button>
              <Button>Clear</Button>
            </div>
          </div>
        </Panel>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatChip label="Buy" value="1.74B" />
            <StatChip label="Sell" value="1.82B" />
            <StatChip label="Lines" value="60" />
          </div>
          {scene === 'compare' && <HubCards variant={variant} />}
          <ResultPanel variant={variant} scene={scene} />
        </div>
      </div>
    </div>
  );
}
