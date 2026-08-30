import { useState } from 'react';
import {
  Button,
  CharacterAvatar,
  DataAgeBadge,
  DataTable,
  EmptyState,
  FilterChip,
  Panel,
  Spinner,
  StatChip,
  Tabs,
} from '@/components/ui';

const COLOR_TOKENS: { name: string; className: string; note?: string }[] = [
  { name: 'bg', className: 'bg-bg' },
  { name: 'panel', className: 'bg-panel' },
  { name: 'panel-2', className: 'bg-panel-2' },
  { name: 'line', className: 'bg-line' },
  { name: 'line-bright', className: 'bg-line-bright' },
  { name: 'text', className: 'bg-text' },
  { name: 'text-dim', className: 'bg-text-dim' },
  { name: 'text-faint', className: 'bg-text-faint', note: 'decorative only' },
  { name: 'accent', className: 'bg-accent' },
  { name: 'accent-dim', className: 'bg-accent-dim', note: 'not for text' },
  { name: 'accent-contrast', className: 'bg-accent-contrast', note: 'text on accent' },
  { name: 'success', className: 'bg-success' },
  { name: 'warning', className: 'bg-warning' },
  { name: 'danger', className: 'bg-danger' },
  { name: 'isk-pos', className: 'bg-isk-pos' },
  { name: 'isk-neg', className: 'bg-isk-neg' },
];

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = Date.now();
const AGE_FRESH = new Date(NOW);
const AGE_MINUTES = new Date(NOW - 12 * MIN);
const AGE_HOURS = new Date(NOW - 5 * HOUR);
const AGE_DAYS = new Date(NOW - 3 * DAY);

/** Stand-in rows for the DataTable sample: shape is irrelevant, the column mix is the point. */
const SAMPLE_ROWS = [
  { id: 1, item: 'Tritanium', qty: 1_250_000, tone: 'text-isk-pos' },
  { id: 2, item: 'Pyerite', qty: -4_200, tone: 'text-isk-neg' },
  { id: 3, item: 'Mexallon', qty: 96_310, tone: '' },
];

const SAMPLE_COLUMNS = [
  { id: 'item', header: 'Item', render: (row: (typeof SAMPLE_ROWS)[number]) => row.item },
  {
    id: 'qty',
    header: 'Quantity',
    align: 'right' as const,
    className: 'tabular-nums',
    cellClassName: (row: (typeof SAMPLE_ROWS)[number]) => row.tone,
    render: (row: (typeof SAMPLE_ROWS)[number]) => row.qty.toLocaleString(),
  },
];

/** A real character id, so the portrait resolves against the EVE image server. */
const SAMPLE_CHARACTER_ID = 90_000_001;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold tracking-widest text-text-dim uppercase">{title}</h2>
      {children}
    </section>
  );
}

export function Styleguide() {
  const [tab, setTab] = useState('open');
  const [chip, setChip] = useState<string | null>('skills');

  return (
    <div className="min-h-screen space-y-10 bg-bg p-6 text-text">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-widest uppercase">NeoCom Desk Styleguide</h1>
        <p className="text-sm text-text-dim">
          Design tokens and base components. Source of truth: docs/DESIGN.md.
        </p>
      </header>

      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {COLOR_TOKENS.map((token) => (
            <div key={token.name} className="rounded-xs border border-line bg-panel p-2">
              <div className={`h-10 rounded-xs border border-line ${token.className}`} />
              <p className="mt-1.5 text-[0.6875rem] font-medium">{token.name}</p>
              {token.note && <p className="text-[0.6875rem] text-text-dim">{token.note}</p>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <Panel>
          <div className="space-y-2">
            <p className="text-xl font-semibold">Page title — 20px semibold</p>
            <p className="text-xs font-semibold tracking-widest text-text-dim uppercase">
              Micro-heading — 12px uppercase widest
            </p>
            <p className="text-sm">Body / data — 14px. Primary content and table values.</p>
            <p className="text-sm text-text-dim">Secondary — 14px text-dim.</p>
            <p className="text-sm tabular-nums">
              Tabular numbers: <span className="text-isk-pos">+1,254,300,912.50 ISK</span>{' '}
              <span className="text-isk-neg">-98,442.00 ISK</span>
            </p>
          </div>
        </Panel>
      </Section>

      <Section title="Panel">
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="With title">
            <p className="text-sm">Default padded content.</p>
          </Panel>
          <Panel
            title="With actions"
            actions={
              <>
                <DataAgeBadge date={AGE_MINUTES} />
                <Button size="sm">Refresh</Button>
              </>
            }
          >
            <p className="text-sm">Header actions slot.</p>
          </Panel>
          <Panel padded={false}>
            <p className="border-b border-line px-3 py-1.5 text-sm">Flush content,</p>
            <p className="px-3 py-1.5 text-sm">e.g. table rows.</p>
          </Panel>
        </div>
      </Section>

      <Section title="Button">
        <Panel>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">Primary</Button>
            <Button>Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button disabled>Disabled</Button>
            <Button variant="danger" disabled>
              Disabled
            </Button>
            <Button variant="primary" size="sm">
              Small
            </Button>
            <Button size="sm">Small</Button>
            <Button variant="danger" size="sm">
              Small
            </Button>
          </div>
        </Panel>
      </Section>

      <Section title="StatChip">
        <Panel>
          <div className="flex flex-wrap gap-2">
            <StatChip label="Wallet" value="1.2B ISK" />
            <StatChip label="SP" value="54.3M" tone="accent" />
            <StatChip label="Training" value="Active" tone="success" />
            <StatChip label="Queue" value="2d left" tone="warning" />
            <StatChip label="Clone" value="Expired" tone="danger" />
          </div>
        </Panel>
      </Section>

      <Section title="DataAgeBadge">
        <Panel>
          <div className="flex flex-wrap gap-6">
            <DataAgeBadge date={AGE_FRESH} />
            <DataAgeBadge date={AGE_MINUTES} />
            <DataAgeBadge date={AGE_HOURS} />
            <DataAgeBadge date={AGE_DAYS} />
          </div>
        </Panel>
      </Section>

      <Section title="Tabs">
        <Panel padded={false}>
          <Tabs
            label="Orders"
            tabs={[
              { id: 'open', label: 'Open orders' },
              { id: 'history', label: 'History' },
              { id: 'transactions', label: 'Transactions' },
            ]}
            value={tab}
            onChange={setTab}
            className="px-2"
          />
          <p className="p-3 text-sm text-text-dim">Active tab: {tab}</p>
        </Panel>
      </Section>

      <Section title="EmptyState">
        <Panel padded={false}>
          <EmptyState
            title="No skill plans"
            hint="Create a plan or import your in-game skill queue to get started."
            action={<Button variant="primary">New skill plan</Button>}
          />
        </Panel>
      </Section>

      <Section title="Spinner">
        <Panel>
          <div className="flex items-center gap-6">
            <Spinner size="sm" />
            <Spinner />
            <Spinner size="lg" />
          </div>
        </Panel>
      </Section>

      <Section title="DataTable">
        <Panel padded={false}>
          <DataTable
            label="DataTable sample"
            columns={SAMPLE_COLUMNS}
            rows={SAMPLE_ROWS}
            rowKey={(row) => row.id}
            rowClassName={(row) => (row.qty < 0 ? 'opacity-50' : undefined)}
          />
        </Panel>
      </Section>

      <Section title="CharacterAvatar">
        <Panel>
          <div className="flex items-center gap-6">
            <CharacterAvatar characterId={SAMPLE_CHARACTER_ID} size="sm" />
            <CharacterAvatar characterId={SAMPLE_CHARACTER_ID} />
            <CharacterAvatar characterId={SAMPLE_CHARACTER_ID} size="lg" />
            <CharacterAvatar characterId={SAMPLE_CHARACTER_ID} size="lg" selected />
          </div>
        </Panel>
      </Section>

      <Section title="FilterChip">
        <Panel>
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              label="Published"
              selected={chip === 'published'}
              onToggle={() => setChip(chip === 'published' ? null : 'published')}
            />
            <FilterChip
              label="Skills"
              count={511}
              selected={chip === 'skills'}
              onToggle={() => setChip(chip === 'skills' ? null : 'skills')}
            />
            <FilterChip
              label="Blueprints"
              count={0}
              selected={chip === 'blueprints'}
              onToggle={() => setChip(chip === 'blueprints' ? null : 'blueprints')}
            />
          </div>
        </Panel>
      </Section>
    </div>
  );
}
