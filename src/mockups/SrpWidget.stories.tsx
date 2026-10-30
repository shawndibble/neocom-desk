import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useTranslation } from 'react-i18next';
import { useIsPhone } from '@/lib/useIsPhone';
import { PageHeader } from '@/components/ui';
import { Widget } from '@/features/overview/widgets/Widget';
import { sampleView } from '@/features/overview/widgets/gallerySamples';
import type { KindView, TableModel } from '@/features/overview/widgets/data/types';
import type { Widget as WidgetModel } from '@/features/overview/widgets/layout';

/**
 * Corp Board widget kind `corpSrp` (Ship replacement): replaces the "Coming
 * soon" placeholder. The real `Widget` shell draws it from a sample `KindView`
 * (the Gallery's preview path), beside two real sample neighbours, at Medium.
 *
 * Officer-only: a pilot without the SRP officer capability sees no tile at all
 * (hidden, never locked). When SRP is off, an officer's tile is the empty state
 * with a link to SRP settings; its Remove widget button is the shell's own.
 *
 * New components in this mockup: none. The Number and Table bodies, the empty
 * state and the tile are the Widget shell; only the board frame (header and
 * grid) is a stand-in for the Corp Board route.
 */
const meta = {
  title: 'mockups/SrpWidget',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const OK = { loading: false, needsPermission: false, error: false, hasData: true, isEmpty: false };
const OWED_ISK = 1_482_300_000;

const TABLE: TableModel = {
  columns: [
    { key: 'pilot', label: 'Pilot', nameFloor: true, priority: 0, minWidth: 100 },
    { key: 'kill', label: 'Killmail', grow: true, priority: 2, minWidth: 90 },
    { key: 'amount', label: 'Amount', align: 'end', priority: 1, minWidth: 56 },
    { key: 'status', label: 'Status', priority: 3, minWidth: 56 },
  ],
  fitWidth: true,
  footer: '1,482,300,000 ISK owed, Approved and not yet Paid',
  rows: [
    {
      key: 'c1',
      cells: [
        'Tamsin Varro',
        'Drake, Tama',
        { text: '38,400,000 ISK', iskAmount: 38_400_000 },
        { text: 'Pending', tone: 'caution' },
      ],
      to: '/corp/srp',
    },
    {
      key: 'c2',
      cells: [
        'Ilse Quor',
        'Thorax, Amamake',
        { text: '24,150,000 ISK', iskAmount: 24_150_000 },
        { text: 'Pending', tone: 'caution' },
      ],
      to: '/corp/srp',
    },
    {
      key: 'c3',
      cells: [
        'Dax Orlen',
        'Megathron, Jita',
        { text: '212,000,000 ISK', iskAmount: 212_000_000 },
        'Approved',
      ],
      to: '/corp/srp',
    },
    {
      key: 'c4',
      cells: [
        'Mira Venn',
        'Rifter, Old Man Star',
        { text: '1,900,000 ISK', iskAmount: 1_900_000 },
        'Approved',
      ],
      to: '/corp/srp',
    },
    {
      key: 'c5',
      cells: [
        'Joss Kade',
        'Hurricane, Hek',
        { text: '61,000,000 ISK', iskAmount: 61_000_000 },
        { text: 'Pending', tone: 'caution' },
      ],
      to: '/corp/srp',
    },
    {
      key: 'c6',
      cells: [
        'Nia Brandt',
        'Caracal, Rens',
        { text: '9,800,000 ISK', iskAmount: 9_800_000 },
        'Approved',
      ],
      to: '/corp/srp',
    },
    {
      key: 'c7',
      cells: [
        'Orrin Teal',
        'Tristan, Dodixie',
        { text: '700,000 ISK', iskAmount: 700_000 },
        { text: 'Pending', tone: 'caution' },
      ],
      to: '/corp/srp',
    },
  ],
};

/** Phone: Pilot, Amount, Status. The killmail is one tap away on the claim. */
function phoneTable(table: TableModel): TableModel {
  const keep = [0, 2, 3];
  return {
    ...table,
    columns: keep.map((i) => ({ ...table.columns[i]!, nameFloor: undefined, minWidth: 56 })),
    rows: table.rows.map((r) => ({ ...r, cells: keep.map((i) => r.cells[i]!) })),
  };
}

function srpView(over: Partial<KindView> = {}): KindView {
  return {
    status: OK,
    fetchedAt: null,
    fromCache: false,
    number: {
      value: '7',
      unit: 'open claims',
      secondary: {
        text: `${OWED_ISK.toLocaleString('en-US')} ISK owed`,
        tone: 'caution',
      },
      notes: ['Approved, not yet Paid'],
      tone: 'clear',
      link: { label: 'Review claims', to: '/corp/srp' },
    },
    rows: [],
    table: TABLE,
    deadlines: [],
    summary: '7 open SRP claims, 1,482,300,000 ISK owed.',
    to: '/corp/srp',
    ...over,
  };
}

const EMPTY = srpView({
  status: { ...OK, isEmpty: true },
  number: { value: '0', unit: 'open claims', tone: 'clear' },
  table: { ...TABLE, rows: [] },
  emptyMessage: 'No open claims',
  emptyHint: 'Pilots file claims on the SRP page. New ones show here while Pending.',
  emptyLinkLabel: 'Open SRP',
});

const OFF = srpView({
  status: { ...OK, isEmpty: true },
  emptyMessage: 'SRP is not turned on',
  emptyHint: 'A Director turns it on and sets the rules in SRP settings.',
  emptyLinkLabel: 'Set up SRP',
  to: '/corp/srp/settings',
});

function tile(view: WidgetModel['view'], size: WidgetModel['size'] = 'M'): WidgetModel {
  return { id: 'srp', kind: 'corpSrp', size, view, scope: 'header', showOnPhone: true };
}

function Neighbour({ kind }: { kind: 'corpKills' | 'corpContracts' }) {
  const { t } = useTranslation();
  const view = sampleView(kind, t);
  if (!view) return null;
  return (
    <Widget
      widget={{
        id: kind,
        kind,
        size: 'S',
        view: 'number',
        scope: 'header',
        showOnPhone: true,
      }}
      previewView={view}
      onRemove={() => undefined}
    />
  );
}

function Board({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-page gap-3 px-4 pt-3 pb-8">
      <PageHeader title="Corp Board" meta="Ashen Vanguard" />
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {children}
        <Neighbour kind="corpContracts" />
        <Neighbour kind="corpKills" />
      </div>
    </div>
  );
}

function Srp({ view, widgetView }: { view: KindView; widgetView: WidgetModel['view'] }) {
  const phone = useIsPhone();
  const shown = phone && view.table ? { ...view, table: phoneTable(view.table) } : view;
  return (
    <Board>
      <Widget widget={tile(widgetView)} previewView={shown} onRemove={() => undefined} />
    </Board>
  );
}

const PHONE = { viewport: { value: 'mobile1', isRotated: false } } as const;

/** @summary Number variant at Medium: open (Pending) claims and the ISK owed (Approved, not yet Paid). */
export const NumberView: Story = { render: () => <Srp view={srpView()} widgetView="number" /> };

/** @summary Number variant in the phone shell. */
export const NumberViewPhone: Story = { ...NumberView, globals: PHONE };

/** @summary Table variant at Medium: pilot, killmail, amount and status per claim; a row opens the claim. */
export const TableView: Story = { render: () => <Srp view={srpView()} widgetView="table" /> };

/** @summary Table variant in the phone shell. */
export const TableViewPhone: Story = { ...TableView, globals: PHONE };

/** @summary Empty: SRP is on but no claim is open. The shell's own empty state, with Open SRP. */
export const Empty: Story = { render: () => <Srp view={EMPTY} widgetView="table" /> };

/** @summary Empty in the phone shell. */
export const EmptyPhone: Story = { ...Empty, globals: PHONE };

/** @summary SRP not turned on, officer's tile: prompt to Set up SRP. A pilot without the capability sees no tile (hidden, never locked). */
export const NotTurnedOn: Story = { render: () => <Srp view={OFF} widgetView="table" /> };

/** @summary SRP not turned on in the phone shell. */
export const NotTurnedOnPhone: Story = { ...NotTurnedOn, globals: PHONE };
