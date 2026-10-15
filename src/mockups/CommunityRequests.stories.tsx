import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  FilterChip,
  Modal,
  NativeSelect,
  Panel,
  SearchInput,
  SlideOver,
  TabPanel,
  Tabs,
  TextArea,
  TextInput,
  useTabsId,
  type DataTableColumn,
} from '@/components/ui';
import { NewComponent } from './NewComponent';

/**
 * Community Requests (the Community Requests scope decision, ADR 0021): a Requests tab
 * on the Community page where any Member posts a Request, others Pledge
 * quantities of its lines, and delivery marks itself from ESI contracts.
 *
 * Built from the real primitives: `Tabs`, `FilterChip`, `SearchInput`,
 * `NativeSelect`, `DataTable`, `SlideOver` (the page stays live behind it, as
 * for My sharing), `Modal`, `TextInput`, `TextArea`, `Checkbox`, `EmptyState`.
 *
 * New components in this mockup: `PledgeBar` (needed / pledged / delivered as
 * one stacked bar with the figures beside it), `RequestsTab` (the tab body),
 * `RequestPanel` (a Request's side panel), `PledgeRow` (a line with its inline
 * quantity and Pledge button) and `ComposeRequestDialog`.
 */

interface Line {
  item: string;
  /** "BPC, runs 10, ME 10" and the like, as the requester asked. */
  spec?: string;
  needed: number;
  pledged: number;
  delivered: number;
  /** This Character's own Pledge on the line, 0 for none. */
  mine?: number;
}

interface Req {
  id: string;
  requester: string;
  mine?: boolean;
  location: string;
  terms: string;
  age: string;
  expires: string;
  status: 'Open' | 'Pledged' | 'Part delivered' | 'Delivered';
  lines: Line[];
}

const REQUESTS: Req[] = [
  {
    id: 'r1',
    requester: 'Aria Voss',
    location: 'Badivefi, Khanid',
    terms: 'Budget 300M total, payment negotiable',
    age: '2h',
    expires: '29d',
    status: 'Part delivered',
    lines: [
      { item: 'Reactive Metals', needed: 350000, pledged: 410000, delivered: 120000, mine: 150000 },
      { item: 'Toxic Metals', needed: 300000, pledged: 90000, delivered: 0 },
      { item: 'Chiral Structures', needed: 175000, pledged: 0, delivered: 0 },
    ],
  },
  {
    id: 'r2',
    requester: 'Bo Tanner',
    location: 'Amarr (region)',
    terms: '90% JBV, will accept contracts daily',
    age: '1d',
    expires: '28d',
    status: 'Pledged',
    lines: [
      {
        item: 'Scan Acquisition Array I',
        spec: 'BPC, runs 10, ME 10',
        needed: 2,
        pledged: 1,
        delivered: 0,
      },
      {
        item: 'Scan Rangefinding Array I',
        spec: 'BPC, runs 10, ME 10',
        needed: 2,
        pledged: 0,
        delivered: 0,
      },
    ],
  },
  {
    id: 'r3',
    requester: 'You',
    mine: true,
    location: 'Efa',
    terms: '',
    age: '3d',
    expires: '26d',
    status: 'Delivered',
    lines: [{ item: 'Ishtar Blueprint', spec: 'BPC, runs 5', needed: 3, pledged: 3, delivered: 3 }],
  },
  {
    id: 'r4',
    requester: 'Cael Ito',
    location: 'Jita',
    terms: '',
    age: '5d',
    expires: '24d',
    status: 'Open',
    lines: [
      { item: 'Tritanium', needed: 10000000, pledged: 0, delivered: 0 },
      { item: 'Pyerite', needed: 2000000, pledged: 0, delivered: 0 },
      { item: 'Mexallon', needed: 400000, pledged: 0, delivered: 0 },
    ],
  },
];

const fmt = (n: number) => n.toLocaleString('en-US');

/** New component: needed / pledged / delivered as one stacked bar, figures beside it (never colour alone). */
function PledgeBar({
  needed,
  pledged,
  delivered,
  unit = '',
}: Pick<Line, 'needed' | 'pledged' | 'delivered'> & { unit?: string }) {
  const pct = (n: number) => `${Math.min(100, (n / Math.max(needed, 1)) * 100)}%`;
  return (
    <div className="min-w-32">
      <div className="relative h-1.5 overflow-hidden rounded-full bg-line">
        <div className="absolute inset-y-0 left-0 bg-accent-dim" style={{ width: pct(pledged) }} />
        <div className="absolute inset-y-0 left-0 bg-success" style={{ width: pct(delivered) }} />
      </div>
      <p className="mt-1 text-[0.6875rem] text-text-dim tabular-nums">
        {fmt(delivered)} delivered · {fmt(pledged)} pledged · {fmt(needed)} needed{unit}
      </p>
    </div>
  );
}

/** The board counts lines, never units: ore and BPC copies don't add up. */
const total = (lines: Line[]) => ({
  needed: lines.length,
  pledged: lines.filter((l) => l.pledged >= l.needed).length,
  delivered: lines.filter((l) => l.delivered >= l.needed).length,
});

const STATUS_TONE: Record<Req['status'], string> = {
  Open: 'text-text-dim',
  Pledged: 'text-accent',
  'Part delivered': 'text-warning',
  Delivered: 'text-success',
};

const columns: DataTableColumn<Req>[] = [
  {
    id: 'requester',
    header: 'Request',
    primary: true,
    render: (r) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium text-accent">
          {r.lines[0].item}
          {r.lines.length > 1 ? ` + ${r.lines.length - 1} more` : ''}
        </span>
        <span className="block truncate text-text-dim">
          {r.requester} · {r.location}
        </span>
      </span>
    ),
    sortValue: (r) => r.requester,
  },
  {
    id: 'terms',
    header: 'Terms',
    render: (r) => (r.terms ? <span className="text-text-dim">{r.terms}</span> : null),
  },
  {
    id: 'progress',
    header: 'Progress',
    render: (r) => <PledgeBar {...total(r.lines)} unit=" lines" />,
  },
  {
    id: 'status',
    header: 'Status',
    render: (r) => <span className={STATUS_TONE[r.status]}>{r.status}</span>,
    sortValue: (r) => r.status,
  },
  {
    id: 'age',
    header: 'Age',
    align: 'right',
    className: 'whitespace-nowrap text-text-dim',
    render: (r) => `${r.age} · ${r.expires} left`,
  },
];

/** New component: the Requests tab body. */
function RequestsTab({ rows, onOpen }: { rows: Req[]; onOpen: (r: Req) => void }) {
  const tabsId = useTabsId();
  const [filter, setFilter] = useState<'open' | 'mine' | 'fill'>('open');
  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-4">
      <Tabs
        tabsId={tabsId}
        label="Community sections"
        value="requests"
        onChange={() => {}}
        tabs={[
          { id: 'blueprints', label: 'Blueprints' },
          { id: 'fittings', label: 'Fittings' },
          { id: 'plans', label: 'Skill plans' },
          { id: 'requests', label: 'Requests', count: rows.length },
          { id: 'members', label: 'Members', count: 12 },
        ]}
      />
      <TabPanel tabsId={tabsId} tabId="requests">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line px-3 py-2">
            <p className="min-w-0 basis-full text-xs text-text-dim sm:basis-0 sm:flex-1">
              You have 1 open Request and 1 Pledge in progress.
            </p>
            <Button size="sm">My pledges</Button>
            <Button size="sm" variant="primary">
              New request…
            </Button>
          </div>
          <Panel>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <SearchInput
                className="min-w-48 flex-1"
                aria-label="Search requests"
                placeholder="Search item, requester or place"
                value=""
                onChange={() => {}}
              />
              <FilterChip
                label="Open"
                selected={filter === 'open'}
                count={3}
                onToggle={() => setFilter('open')}
              />
              <FilterChip
                label="Mine"
                selected={filter === 'mine'}
                count={1}
                onToggle={() => setFilter('mine')}
              />
              <FilterChip
                label="I can fill"
                selected={filter === 'fill'}
                count={2}
                tooltip="Requests with a line for a blueprint you share with this Community."
                onToggle={() => setFilter('fill')}
              />
              <NativeSelect aria-label="Distance" defaultValue="any">
                <option value="any">Any distance</option>
                <option value="5">Within 5 jumps</option>
                <option value="10">Within 10 jumps</option>
                <option value="20">Within 20 jumps</option>
              </NativeSelect>
            </div>
            <DataTable
              label="Requests"
              rows={rows}
              rowKey={(r) => r.id}
              columns={columns}
              onRowClick={onOpen}
              stackLayout="dense"
            />
          </Panel>
        </div>
      </TabPanel>
    </div>
  );
}

/** New component: one line of a Request with its inline quantity and Pledge button. */
function PledgeRow({ line, own }: { line: Line; own: boolean }) {
  const open = Math.max(0, line.needed - line.pledged);
  return (
    <li className="space-y-1.5 px-1 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{line.item}</span>
        {line.spec && <span className="text-xs text-text-dim">{line.spec}</span>}
      </div>
      <PledgeBar {...line} />
      {line.pledged > line.needed && (
        <p className="text-[0.6875rem] text-text-dim">
          Over-pledged by {fmt(line.pledged - line.needed)}: Pledges don't reserve anything.
        </p>
      )}
      {!own && (
        <div className="flex items-center gap-2">
          <TextInput
            size="sm"
            aria-label={`Quantity you can provide of ${line.item}`}
            className="w-28 tabular-nums"
            defaultValue={line.mine ? String(line.mine) : String(open || '')}
            inputMode="numeric"
          />
          <Button size="sm">{line.mine ? 'Update pledge' : 'Pledge'}</Button>
          {line.mine ? (
            <Button size="sm" variant="ghost">
              Withdraw
            </Button>
          ) : null}
        </div>
      )}
    </li>
  );
}

/** New component: a Request's side panel, as seen by a Member (or by its requester). */
function RequestPanel({ req, onClose }: { req: Req; onClose: () => void }) {
  return (
    <SlideOver
      open
      onClose={onClose}
      title={`${req.requester}'s request`}
      subtitle={`${req.location} · posted ${req.age} ago · closes in ${req.expires}`}
    >
      <div className="space-y-3 text-sm">
        {req.terms && (
          <p className="rounded-xs border border-line bg-panel-2 px-3 py-2 text-xs">
            <span className="text-text-dim">Terms: </span>
            {req.terms}
          </p>
        )}
        <ul className="divide-y divide-line">
          {req.lines.map((line) => (
            <PledgeRow key={line.item} line={line} own={!!req.mine} />
          ))}
        </ul>
        <p className="text-xs text-text-dim">
          Delivery is marked from your finished contracts to {req.mine ? 'you' : req.requester}, in
          game. Nothing is reserved; agree the terms yourselves.
        </p>
        <div className="flex flex-wrap gap-2">
          {req.mine ? (
            <>
              <Button size="sm">Extend 30 days</Button>
              <Button size="sm" variant="ghost">
                Close request
              </Button>
            </>
          ) : (
            <Button size="sm">Message {req.requester}…</Button>
          )}
        </div>
      </div>
    </SlideOver>
  );
}

/** New component: the compose dialog, a line table, then who to mail, then review and send. */
function ComposeRequestDialog({ step }: { step: 'lines' | 'recipients' }) {
  return (
    <Modal open onClose={() => {}} title="New request" placement="wide">
      <div className="space-y-4 text-sm">
        {step === 'lines' ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs text-text-dim">Location (optional)</span>
                <TextInput defaultValue="Badivefi" />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-text-dim">Terms (optional)</span>
                <TextInput placeholder="Budget, price basis, payment negotiable…" />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-text-dim">
                Paste a list (an Appraisal, an inventory copy)
              </span>
              <TextArea
                rows={4}
                defaultValue={
                  'Reactive Metals\t350,000\nToxic Metals\t300,000\nChiral Structures\t175,000'
                }
              />
            </label>
            <ul className="divide-y divide-line rounded-xs border border-line">
              {['Reactive Metals', 'Toxic Metals', 'Chiral Structures'].map((item, i) => (
                <li key={item} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate">{item}</span>
                  <TextInput
                    size="sm"
                    aria-label={`${item} quantity`}
                    className="w-28 tabular-nums"
                    defaultValue={['350000', '300000', '175000'][i]}
                  />
                  <Button size="sm" variant="ghost" aria-label={`Remove ${item}`}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            <SearchInput
              aria-label="Add an item"
              placeholder="Add an item or blueprint…"
              value=""
              onChange={() => {}}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost">
                Cancel
              </Button>
              <Button size="sm" variant="primary">
                Next: who to mail
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-text-dim">
              Everyone in the Community can see the Request. Mail goes only to the Members you tick,
              one mail each, covering the whole list. 3 of 100 mails sent today.
            </p>
            <ul className="divide-y divide-line rounded-xs border border-line">
              {[
                ['Bo Tanner', 'Shares 2 of these blueprints', true],
                ['Cael Ito', 'Shares 1 of these blueprints', true],
                ['Dana Reyes', '', false],
                ['Eli Park', '', false],
              ].map(([name, why, on]) => (
                <li key={String(name)} className="flex items-center gap-2 px-3 py-1.5">
                  <Checkbox defaultChecked={Boolean(on)} aria-label={`Mail ${String(name)}`} />
                  <span className="flex-1">{String(name)}</span>
                  <span className="text-xs text-text-dim">{String(why)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-2">
              <Button size="sm" variant="ghost">
                Back
              </Button>
              <Button size="sm" variant="primary">
                Post request and mail 2 Members
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Page({ initial }: { initial?: Req }) {
  const [open, setOpen] = useState<Req | undefined>(initial);
  return (
    <>
      <NewComponent name="RequestsTab">
        <RequestsTab rows={REQUESTS} onOpen={setOpen} />
      </NewComponent>
      {open && (
        <NewComponent name="RequestPanel">
          <RequestPanel req={open} onClose={() => setOpen(undefined)} />
        </NewComponent>
      )}
    </>
  );
}

const meta = {
  title: 'mockups/CommunityRequests',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/communities' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'mobile1', isRotated: false } } as const;

/** @summary The Requests tab: the board with its filters. New components: RequestsTab, PledgeBar. */
export const Board: Story = { render: () => <Page /> };

/** @summary The board in the phone shell (dense cards). */
export const BoardPhone: Story = { render: () => <Page />, globals: phone };

/** @summary A Member opens a Request: the line table with inline quantity and Pledge, over-pledge note, Message. New components: RequestPanel, PledgeRow. */
export const PanelAsMember: Story = { render: () => <Page initial={REQUESTS[0]} /> };

/** @summary The side panel in the phone shell. */
export const PanelAsMemberPhone: Story = {
  render: () => <Page initial={REQUESTS[0]} />,
  globals: phone,
};

/** @summary The requester's own Request: no Pledge controls, Extend and Close request instead. */
export const PanelAsRequester: Story = { render: () => <Page initial={REQUESTS[2]} /> };

/** @summary Compose step 1: location, terms, pasted list, editable lines, add an item. New component: ComposeRequestDialog. */
export const ComposeLines: Story = {
  render: () => (
    <>
      <Page />
      <NewComponent name="ComposeRequestDialog">
        <ComposeRequestDialog step="lines" />
      </NewComponent>
    </>
  ),
};

/** @summary Compose step 2: who to mail, pre-ticked from shared blueprints, with the day's mail count. */
export const ComposeRecipients: Story = {
  render: () => (
    <>
      <Page />
      <NewComponent name="ComposeRequestDialog">
        <ComposeRequestDialog step="recipients" />
      </NewComponent>
    </>
  ),
};

/** @summary Compose in the phone shell. */
export const ComposeLinesPhone: Story = { ...ComposeLines, globals: phone };

/** @summary A Community with no Requests yet. */
export const Empty: Story = {
  render: () => (
    <div className="mx-auto max-w-6xl px-4 py-4">
      <NewComponent name="RequestsTab">
        <Panel>
          <EmptyState
            title="No requests yet"
            hint="Post what you're looking for and Members can pledge to supply it."
            action={
              <Button size="sm" variant="primary">
                New request…
              </Button>
            }
          />
        </Panel>
      </NewComponent>
    </div>
  ),
};
