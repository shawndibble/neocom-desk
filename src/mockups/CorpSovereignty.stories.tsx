import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Modal, StatChip, StatChips } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { Widget } from '@/features/overview/widgets/Widget';
import { JumpsLink } from '@/features/route/JumpsLink';
import type { Widget as WidgetModel } from '@/features/overview/widgets/layout';
import type { KindView, TableModel } from '@/features/overview/widgets/data/types';
import { NewComponent } from './NewComponent';

/**
 * Issue #4775: two options for the Corp Board's sovereignty widget, built on
 * the ESI routes as they really are (OpenAPI, compatibility date 2026-05-19):
 *
 * - `GET /corporations/{id}/structures/skyhooks/{id}` (Station_Manager):
 *   `theft_vulnerability {start, end}`, `reagents[] {secured_stock,
 *   unsecured_stock}`, `state`. There is no silo capacity, so no "% full":
 *   the fact is the unsecured stock, which is what a raider can take.
 * - `GET /corporations/{id}/structures/sovereignty-hubs/{id}` (Station_Manager):
 *   `reagent_bay.reagents[] {amount, burning_per_hour}` (so a fuel clock),
 *   `upgrades[] {power_state}`, `resources.power/workforce`, `vulnerability_window`.
 * - `GET /skyhooks/raidable` is public. Mercenary dens are character routes,
 *   so they are not in a corp widget.
 *
 * Option A, "Raid clock": one row per skyhook, sorted by when its theft window
 * opens; the Chart view is the existing Gantt of windows over 48h. Hub fuel goes
 * to Deadlines as a fuel row, like a structure's.
 *
 * Option B, "Per system": one row per system with the hub's fuel, its next raid,
 * what is at risk and its upgrades. Two clocks share a row.
 *
 * The widgets are the real `Widget` shell drawn from a sample `KindView`; the
 * stand-in kind only supplies the shell and the title is overridden.
 *
 * New components in this mockup: `corpSovereignty` (the widget kind, both
 * options), `SkyhookModal` (A's row modal), `SystemModal` (B's row modal).
 * Set destination is an ESI write, so it is dimmed offline (DESIGN §6c). The
 * jump count is a `JumpsLink` to Route Safety, not an external map. System ids
 * are sample values.
 */

const NOW = Date.now();
const H = 3_600_000;

const ready = {
  loading: false,
  needsPermission: false,
  error: false,
  hasData: true,
  isEmpty: false,
};

const sample = (over: Partial<KindView>): KindView => ({
  status: ready,
  fetchedAt: new Date(NOW - 4 * 60_000),
  fromCache: false,
  number: { value: '0', tone: 'clear' },
  rows: [],
  deadlines: [],
  summary: '',
  to: '/corp/sovereignty',
  ...over,
});

// --- Option A: Raid clock --------------------------------------------------

const RAIDS = [
  { key: 'x7', label: 'X-7OMU IV', start: 2, end: 6, isk: 412_000_000 },
  { key: 'efa', label: 'Efa II', start: 5.7, end: 9.7, isk: 96_500_000 },
  { key: '4h', label: '4-HWWF VII', start: 27, end: 31, isk: 677_000_000 },
  { key: 'cj', label: 'C-J6MT III', start: 59, end: 63, isk: 0 },
];

const opensIn = (h: number) => (h < 24 ? `in ${Math.floor(h)}h` : `in ${Math.floor(h / 24)}d`);

const RAID_TABLE: TableModel = {
  columns: [
    { key: 'hook', label: 'Skyhook', sortable: true },
    { key: 'opens', label: 'Window opens', sortable: true },
    { key: 'risk', label: 'Unsecured', align: 'end', sortable: true },
  ],
  rows: RAIDS.map((r, i) => ({
    key: r.key,
    tone: i === 0 ? 'critical' : i === 1 ? 'warning' : 'clear',
    cells: [
      r.label,
      r.start < 6 ? { text: opensIn(r.start), tone: 'bad' } : opensIn(r.start),
      r.isk ? { text: `${(r.isk / 1e6).toFixed(0)}M ISK`, iskAmount: r.isk } : 'Nothing',
    ],
    sort: [r.label, r.start, r.isk],
  })),
};

const RAID_VIEW = sample({
  number: {
    value: '2',
    unit: 'skyhooks raidable in 6h',
    tone: 'warning',
    secondary: { text: 'X-7OMU IV opens in 2h, 412M ISK unsecured', tone: 'bad' },
  },
  table: RAID_TABLE,
  chart: {
    kind: 'gantt',
    summary: 'Theft windows in the next 48 hours',
    note: 'Theft windows, next 48h',
    axis: { from: NOW, to: NOW + 48 * H, now: NOW },
    labels: { from: '', now: 'Now', to: '+48h' },
    rows: RAIDS.filter((r) => r.start < 48).map((r) => ({
      key: r.key,
      label: r.label,
      startMs: NOW + r.start * H,
      endMs: NOW + r.end * H,
      text: opensIn(r.start),
      color: r.start < 6 ? 'warning' : 's2',
    })),
    fallback: { kind: 'hbars', summary: '', rows: [] },
  },
});

// --- Option B: Per system --------------------------------------------------

const SYSTEM_TABLE: TableModel = {
  columns: [
    { key: 'system', label: 'System', sortable: true },
    { key: 'fuel', label: 'Hub fuel', sortable: true },
    { key: 'raid', label: 'Next raid', sortable: true },
    { key: 'risk', label: 'Unsecured', align: 'end', sortable: true },
    { key: 'upg', label: 'Upgrades', hideNarrow: true },
  ],
  rows: [
    {
      key: 'x7',
      tone: 'critical',
      cells: [
        'X-7OMU',
        { text: '9d 4h', bar: 0.65 },
        { text: 'in 2h', tone: 'bad' },
        { text: '412M ISK', iskAmount: 412_000_000 },
        '5 online',
      ],
    },
    {
      key: 'efa',
      tone: 'warning',
      cells: [
        'Efa',
        { text: '1d 2h', bar: 0.08, tone: 'bad' },
        { text: 'in 5h', tone: 'caution' },
        { text: '97M ISK', iskAmount: 96_500_000 },
        { text: '4 online, 1 low', tone: 'caution' },
      ],
    },
    {
      key: '4h',
      cells: [
        '4-HWWF',
        { text: '21d', bar: 1 },
        'in 1d',
        { text: '677M ISK', iskAmount: 677_000_000 },
        '6 online',
      ],
    },
    {
      key: 'cj',
      cells: ['C-J6MT', { text: '14d 6h', bar: 0.7 }, 'in 2d', 'Nothing', '2 online'],
    },
  ],
};

const SYSTEM_VIEW = sample({
  number: {
    value: '2h',
    unit: 'to next sov clock',
    tone: 'critical',
    secondary: { text: 'X-7OMU IV theft window opens', tone: 'bad' },
    notes: ['Efa hub fuel runs out in 1d 2h'],
  },
  table: SYSTEM_TABLE,
});

// --- Deadlines (existing widget) ------------------------------------------

const DEADLINES_VIEW = sample({
  number: { value: '4', unit: 'due soon', tone: 'warning' },
  table: {
    columns: [
      { key: 'what', label: 'What' },
      { key: 'kind', label: 'Kind' },
      { key: 'when', label: 'In', align: 'end' },
    ],
    rows: [
      { key: 'raid1', tone: 'critical', cells: ['X-7OMU IV skyhook', 'Theft window opens', '2h'] },
      { key: 'raid2', tone: 'warning', cells: ['Efa II skyhook', 'Theft window opens', '5h 40m'] },
      { key: 'moon', tone: 'warning', cells: ['Efa VI - Moon 4', 'Moon arrival', '11h'] },
      { key: 'hub', tone: 'warning', cells: ['Efa sov hub', 'Reagents run out', '1d 2h'] },
    ],
  },
});

// --- Board ----------------------------------------------------------------

const widget = (over: Partial<WidgetModel>): WidgetModel => ({
  id: 'w',
  kind: 'corpServices',
  view: 'table',
  title: 'Sovereignty',
  size: 'M',
  scope: 'header',
  showOnPhone: true,
  ...over,
});
const noop = () => {};

function Board({ children, modal }: { children: ReactNode; modal?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-4">
      <h1 className="text-xl font-semibold">Corp Board</h1>
      {children}
      <Widget
        widget={widget({ id: 'd', kind: 'corpDeadlines', title: 'Deadlines', view: 'table' })}
        previewView={DEADLINES_VIEW}
        onRemove={noop}
      />
      {modal}
    </div>
  );
}

function OptionA() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <NewComponent name="corpSovereignty A · Number">
        <Widget
          widget={widget({ id: 'an', size: 'S', view: 'number' })}
          previewView={RAID_VIEW}
          onRemove={noop}
        />
      </NewComponent>
      <div className="md:col-span-2">
        <NewComponent name="corpSovereignty A · Chart (Gantt + table)">
          <Widget
            widget={widget({ id: 'ac', size: 'L', view: 'chart' })}
            previewView={RAID_VIEW}
            onRemove={noop}
          />
        </NewComponent>
      </div>
    </div>
  );
}

function OptionB() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <NewComponent name="corpSovereignty B · Number">
        <Widget
          widget={widget({ id: 'bn', size: 'S', view: 'number' })}
          previewView={SYSTEM_VIEW}
          onRemove={noop}
        />
      </NewComponent>
      <div className="md:col-span-2">
        <NewComponent name="corpSovereignty B · Table">
          <Widget
            widget={widget({ id: 'bt', size: 'L', view: 'table' })}
            previewView={SYSTEM_VIEW}
            onRemove={noop}
          />
        </NewComponent>
      </div>
    </div>
  );
}

/** Set destination, and the jump count from the Character's system as a link to Route Safety. */
function Actions({ systemId, jumps }: { systemId: number; jumps: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost">Set destination</Button>
      <JumpsLink systemId={systemId} label={`${jumps} jumps, open route safety`}>
        {jumps} jumps away
      </JumpsLink>
    </div>
  );
}

function SkyhookModal() {
  return (
    <Modal open onClose={noop} title="X-7OMU IV skyhook">
      <NewComponent name="SkyhookModal">
        <div className="space-y-3">
          <StatChips>
            <StatChip label="Theft window" value="opens in 2h · closes in 6h" />
            <StatChip label="State" value="Shield vulnerable" />
          </StatChips>
          <StatChips>
            <StatChip label="Unsecured" value="4,200 Magmatic Gas · 412,000,000 ISK" />
            <StatChip label="Secured" value="11,800 Magmatic Gas" />
          </StatChips>
          <Actions systemId={30001190} jumps={7} />
        </div>
      </NewComponent>
    </Modal>
  );
}

function SystemModal() {
  return (
    <Modal open onClose={noop} title="Efa">
      <NewComponent name="SystemModal">
        <div className="space-y-3">
          <StatChips>
            <StatChip label="Hub fuel" value="runs out in 1d 2h" />
            <StatChip label="Burn" value="120 Superionic Ice / h" />
            <StatChip label="Hub vulnerable" value="18:00–22:00" />
          </StatChips>
          <div className="flex flex-wrap gap-2">
            <Pill>Cynosural Navigation · Online</Pill>
            <Pill>Major Threat Detection · Online</Pill>
            <Pill tone="warning">Pirate Detection · Low power</Pill>
          </div>
          <StatChips>
            <StatChip label="Efa II skyhook" value="theft window in 5h 40m" />
            <StatChip label="Unsecured" value="1,850 Superionic Ice · 96,500,000 ISK" />
          </StatChips>
          <Actions systemId={30003840} jumps={12} />
        </div>
      </NewComponent>
    </Modal>
  );
}

const meta = {
  title: 'mockups/CorpSovereignty',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/corp' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { viewport: { value: 'mobile1', isRotated: false } };

/** @summary Option A, Raid clock: one row per skyhook, Gantt of theft windows. New component: corpSovereignty. */
export const OptionARaidClock: Story = {
  render: () => (
    <Board>
      <OptionA />
    </Board>
  ),
};

/** @summary Option A on a phone. */
export const OptionARaidClockPhone: Story = { ...OptionARaidClock, globals: phone };

/** @summary Option A's row modal. New component: SkyhookModal. */
export const OptionAModal: Story = {
  render: () => (
    <Board modal={<SkyhookModal />}>
      <OptionA />
    </Board>
  ),
};

/** @summary Option B, Per system: hub fuel, next raid, unsecured, upgrades. New component: corpSovereignty. */
export const OptionBPerSystem: Story = {
  render: () => (
    <Board>
      <OptionB />
    </Board>
  ),
};

/** @summary Option B on a phone. */
export const OptionBPerSystemPhone: Story = { ...OptionBPerSystem, globals: phone };

/** @summary Option B's row modal. New component: SystemModal. */
export const OptionBModal: Story = {
  render: () => (
    <Board modal={<SystemModal />}>
      <OptionB />
    </Board>
  ),
};
