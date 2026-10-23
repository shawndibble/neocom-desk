import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, Modal, ProgressBar, StatChip, StatChips } from '@/components/ui';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { Pill } from '@/components/ui/Pill';
import { Widget } from '@/features/overview/widgets/Widget';
import type { Widget as WidgetModel } from '@/features/overview/widgets/layout';
import type { KindView, TableModel } from '@/features/overview/widgets/data/types';
import { NewComponent } from './NewComponent';

/**
 * Issue #4775: a `corpSovereignty` widget on the Corp Board (group "Clocks")
 * for the Equinox sov hub and skyhook routes. Number and Table views, a row
 * modal, and each raid window as a `corpDeadlines` row. Sample data.
 *
 * The widgets are the real `Widget` shell drawn from a sample `KindView`
 * (the Gallery's preview path), so they look like what will ship. The stand-in
 * kind `corpServices` only supplies the shell; the title is overridden.
 *
 * New components in this mockup: `SovereigntyRowModal` (the modal body: timers,
 * silo level, owner, Set destination, Dotlan link). The widget itself is the
 * existing widget shell with a new kind. Set destination is an ESI write, so it
 * is dimmed offline (DESIGN §6c).
 *
 * Open questions from the ticket stay open: which role reads a corp's
 * skyhooks, and whether mercenary dens get their own widget. The mockup shows
 * skyhooks and sov hubs together and leaves dens out.
 */

const sample = (over: Partial<KindView>): KindView => ({
  status: {
    loading: false,
    needsPermission: false,
    error: false,
    hasData: true,
    isEmpty: false,
  },
  fetchedAt: new Date('2026-10-22T10:00:00Z'),
  fromCache: false,
  number: { value: '2', unit: 'raidable', tone: 'warning' },
  rows: [],
  deadlines: [],
  summary: '',
  to: '/corp/sovereignty',
  ...over,
});

const TABLE: TableModel = {
  columns: [
    { key: 'system', label: 'System', sortable: true },
    { key: 'raid', label: 'Next raid window', sortable: true },
    { key: 'silo', label: 'Reagent silo', align: 'end' },
    { key: 'adm', label: 'ADM Mil / Ind / Strat', align: 'end', hideNarrow: true },
  ],
  rows: [
    {
      key: 'x7',
      tone: 'warning',
      cells: [
        'X-7OMU',
        { text: 'in 2h', tone: 'bad' },
        { text: '38%', bar: 0.38, tone: 'caution' },
        '4.2 / 3.1 / 2.0',
      ],
    },
    {
      key: 'efa',
      tone: 'warning',
      cells: [
        'Efa',
        { text: 'in 5h 40m', tone: 'caution' },
        { text: '71%', bar: 0.71 },
        '5.0 / 2.4 / 1.1',
      ],
    },
    {
      key: 'jita',
      cells: ['4-HWWF', { text: 'in 1d 3h' }, { text: '92%', bar: 0.92 }, '3.3 / 4.8 / 2.6'],
    },
    {
      key: 'c5',
      cells: [
        'C-J6MT',
        { text: 'in 2d 11h' },
        { text: '15%', bar: 0.15, tone: 'bad' },
        '1.2 / 1.0 / 1.0',
      ],
    },
  ],
};

const NUMBER_VIEW = sample({
  number: {
    value: '2',
    unit: 'skyhooks raidable in 6h',
    tone: 'warning',
    secondary: { text: 'Next: X-7OMU in 2h', tone: 'caution' },
  },
  summary: '2 skyhooks raidable in 6h',
});

const TABLE_VIEW = sample({ ...NUMBER_VIEW, table: TABLE, rows: [] });

const DEADLINES_VIEW = sample({
  number: { value: '3', unit: 'due soon', tone: 'warning' },
  table: {
    columns: [
      { key: 'what', label: 'What' },
      { key: 'kind', label: 'Kind' },
      { key: 'when', label: 'In', align: 'end' },
    ],
    rows: [
      { key: 'raid1', tone: 'critical', cells: ['X-7OMU skyhook', 'Raid window opens', '2h'] },
      { key: 'moon', tone: 'warning', cells: ['Efa VI - Moon 4', 'Moon arrival', '11h'] },
      { key: 'raid2', tone: 'warning', cells: ['Efa skyhook', 'Raid window opens', '5h 40m'] },
      { key: 'fuel', cells: ['Efa Athanor', 'Fuel', '3d 4h'] },
    ],
  },
});

const base = { size: 'M', scope: 'header', showOnPhone: true } as const;
const widget = (over: Partial<WidgetModel>): WidgetModel => ({
  id: 'w',
  kind: 'corpServices',
  view: 'table',
  title: 'Sovereignty',
  ...base,
  ...over,
});
const noop = () => {};

function Board({ modal }: { modal?: boolean }) {
  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-4">
      <h1 className="text-xl font-semibold">Corp Board</h1>
      <div className="grid gap-3 md:grid-cols-3">
        <NewComponent name="corpSovereignty (Number)">
          <Widget
            widget={widget({ id: 'n', size: 'S', view: 'number' })}
            previewView={NUMBER_VIEW}
            onRemove={noop}
          />
        </NewComponent>
        <div className="md:col-span-2">
          <NewComponent name="corpSovereignty (Table)">
            <Widget
              widget={widget({ id: 't', size: 'M', view: 'table' })}
              previewView={TABLE_VIEW}
              onRemove={noop}
            />
          </NewComponent>
        </div>
      </div>
      <Widget
        widget={widget({
          id: 'd',
          kind: 'corpDeadlines',
          title: 'Deadlines',
          size: 'M',
          view: 'table',
        })}
        previewView={DEADLINES_VIEW}
        onRemove={noop}
      />
      <p className="text-sm text-text-dim">
        Each raid window above is also a row in Deadlines and counts toward the header's Next
        button.
      </p>
      <Modal open={modal === true} onClose={noop} title="X-7OMU skyhook">
        <NewComponent name="SovereigntyRowModal">
          <div className="space-y-3">
            <StatChips>
              <StatChip label="Raid window" value="opens in 2h, closes in 6h" />
              <StatChip label="Owner" value="Red Cat Mining" />
              <StatChip label="ADM" value="4.2 / 3.1 / 2.0" />
            </StatChips>
            <div>
              <div className="mb-1 flex items-center gap-2 text-sm">
                Reagent silo <Pill>38% full</Pill>
              </div>
              <ProgressBar value={0.38} label="Reagent silo" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost">Set destination</Button>
              <ExternalLink href="https://evemaps.dotlan.net/system/X-7OMU">Dotlan</ExternalLink>
            </div>
          </div>
        </NewComponent>
      </Modal>
    </div>
  );
}

const meta = {
  title: 'mockups/CorpSovereignty',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/corp' } },
  render: () => <Board />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Corp Board with the Sovereignty widget (Number and Table views) and its raid windows in Deadlines. New components: corpSovereignty widget kind. */
export const Board_: Story = {};

/** @summary The same board on a phone. */
export const BoardPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary The row modal: timers, silo level, owner, Set destination, Dotlan. New component: SovereigntyRowModal. */
export const RowModal: Story = { render: () => <Board modal /> };

/** @summary The row modal on a phone, as a sheet. */
export const RowModalPhone: Story = {
  render: () => <Board modal />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
