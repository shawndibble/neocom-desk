import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Modal, StatChip, StatChips } from '@/components/ui';
import { Widget } from '@/features/overview/widgets/Widget';
import { JumpsLink } from '@/features/route/JumpsLink';
import type { Widget as WidgetModel } from '@/features/overview/widgets/layout';
import type { KindView, TableModel } from '@/features/overview/widgets/data/types';
import { NewComponent } from './NewComponent';

/**
 * Issue #4775: the sovereignty widgets (Corp Board and Overview), built on
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
 * Chosen (2026-10-23): Option A, two tiers.
 *
 * Station_Manager tier, Corp Board (`corpSovereignty`): one row per skyhook,
 * sorted by when its theft window opens; the Chart view is the existing Gantt
 * of windows over 48h. Hub fuel goes to Deadlines as a fuel row, like a
 * structure's.
 *
 * Member tier, Overview (`sovRaids`): public data only, so any Character in a
 * sov-holding alliance sees skyhooks in its space raidable now or soon, with
 * jumps. Option B (one row per system) was dropped: it hid every skyhook but
 * the next in a system.
 *
 * The widgets are the real `Widget` shell drawn from a sample `KindView`; the
 * stand-in kind only supplies the shell and the title is overridden.
 *
 * New components in this mockup: `corpSovereignty` and `sovRaids` (the two
 * widget kinds), `SkyhookModal` (the row modal, with and without stock).
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

// --- Member tier: public data, Overview -------------------------------------

/**
 * `GET /skyhooks/raidable` (public) lists skyhooks raidable now or shortly
 * (about 2h ahead), with system, planet and window. Kept to systems whose
 * `GET /sovereignty/systems` claim is the Character's alliance. No stock, no
 * 48h look-ahead: those need Station_Manager.
 */
const MEMBER_TABLE: TableModel = {
  columns: [
    { key: 'hook', label: 'Skyhook', sortable: true, nameFloor: true },
    { key: 'window', label: 'Theft window', sortable: true },
    { key: 'jumps', label: 'Jumps', align: 'end', sortable: true },
  ],
  rows: [
    {
      key: 'x7',
      tone: 'critical',
      cells: ['X-7OMU IV', { text: 'open, 1h 20m left', tone: 'bad' }, '7'],
      sort: ['X-7OMU IV', 0, 7],
    },
    {
      key: 'efa',
      tone: 'warning',
      cells: ['Efa II', { text: 'in 1h 40m', tone: 'caution' }, '12'],
      sort: ['Efa II', 1.7, 12],
    },
  ],
};

const MEMBER_VIEW = sample({
  number: {
    value: '2',
    unit: 'skyhooks raidable in our space',
    tone: 'critical',
    secondary: { text: 'X-7OMU IV open now, 7 jumps', tone: 'bad' },
  },
  table: MEMBER_TABLE,
  to: '/travel/route',
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

function MemberBoard({ modal }: { modal?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-4">
      <h1 className="text-xl font-semibold">Overview</h1>
      <div className="grid gap-3 md:grid-cols-3">
        <NewComponent name="sovRaids · Number">
          <Widget
            widget={widget({ id: 'mn', title: 'Skyhook raids', size: 'S', view: 'number' })}
            previewView={MEMBER_VIEW}
            onRemove={noop}
          />
        </NewComponent>
        <div className="md:col-span-2">
          <NewComponent name="sovRaids · Table">
            <Widget
              widget={widget({ id: 'mt', title: 'Skyhook raids', size: 'M', view: 'table' })}
              previewView={MEMBER_VIEW}
              onRemove={noop}
            />
          </NewComponent>
        </div>
      </div>
      {modal}
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

function MemberModal() {
  return (
    <Modal open onClose={noop} title="X-7OMU IV skyhook">
      <NewComponent name="SkyhookModal (no role)">
        <div className="space-y-3">
          <StatChips>
            <StatChip label="Theft window" value="open now · closes in 1h 20m" />
            <StatChip label="Held by" value="Our alliance" />
          </StatChips>
          <Actions systemId={30001190} jumps={7} />
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

/** @summary Member tier on the Overview: public data, skyhooks in our space raidable now or soon. New component: sovRaids. */
export const MemberTier: Story = { render: () => <MemberBoard /> };

/** @summary The member tier on a phone. */
export const MemberTierPhone: Story = { ...MemberTier, globals: phone };

/** @summary The member tier's row modal: window and jumps, no stock. */
export const MemberTierModal: Story = { render: () => <MemberBoard modal={<MemberModal />} /> };
