import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Link } from 'react-router-dom';
import { Button, Eyebrow, Modal, ProgressBar, StatChip, StatChips } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { Widget } from '@/features/overview/widgets/Widget';
import { flexRule, GRID_GAP } from '@/features/overview/widgets/gridStyle';
import type { WidgetSize } from '@/features/overview/widgets/kinds';
import type { Widget as WidgetModel } from '@/features/overview/widgets/layout';
import type { KindView, TableModel } from '@/features/overview/widgets/data/types';
import { routeToHref } from '@/features/route/routeSafetyLink';
import { NewComponent } from './NewComponent';

/**
 * Issue #4791: a Mercenary Dens widget on the player Overview. Sample data.
 *
 * Picked: Overview placement (not the Corp Board) and the Detailed row modal.
 * ESI serves dens per character only (`/characters/{id}/structures/mercenary-dens`,
 * scope `esi-structures.read_character.v1`; operations need
 * `esi-activities.read_character.v1`), so the widget follows the header's
 * This character / All characters scope. Den clocks feed the header's Next.
 *
 * The table never scrolls sideways: it keeps the columns that fit its own box,
 * dropping by priority (Character, Jumps, Infomorphs, Anarchy, Operations, State;
 * Planet always stays). The size story draws what that fit gives at each size
 * on a 1440 desktop; the build measures the box, so it holds at every width.
 *
 * The widgets are the real `Widget` shell drawn from a sample `KindView`, laid out
 * with the real grid's `flexRule`. The stand-in kinds (`planetary`, `comingUp`)
 * only supply the shell; titles are overridden.
 *
 * New components in this mockup: `mercenaryDens` widget kind (Number and Table),
 * width-fit columns for the widget table (TableBody), `MercenaryDenModal`. Set destination is an ESI write, so it is
 * dimmed offline (DESIGN §6c). No Dotlan link (#4775 ruling). No infomorph fill
 * gauge or ISK value: ESI sends no capacity and no key price is verified.
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
  number: { value: '1', unit: 'den reinforced', tone: 'warning' },
  rows: [],
  deadlines: [],
  summary: '',
  to: '/',
  ...over,
});

/** Every column, in display order; `priority` is the order they drop in (highest first). */
const DENS: TableModel = {
  columns: [
    { key: 'planet', label: 'Planet', sortable: true, priority: 0 },
    { key: 'state', label: 'State', sortable: true, priority: 1 },
    { key: 'mto', label: 'Operations', align: 'end', priority: 2 },
    { key: 'anarchy', label: 'Anarchy', align: 'end', priority: 3 },
    { key: 'infomorphs', label: 'Infomorphs', align: 'end', priority: 4 },
    { key: 'jumps', label: 'Jumps', align: 'end', priority: 5 },
    { key: 'pilot', label: 'Character', priority: 6 },
  ],
  rows: [
    {
      key: 'efa',
      tone: 'critical',
      cells: [
        'Efa VII',
        { text: 'Reinforced, 14h', tone: 'bad' },
        '1 ready, 1d 4h',
        'Level 1',
        '184',
        '4',
        'Kira Vex',
      ],
    },
    {
      key: 'x7',
      tone: 'warning',
      cells: [
        'X-7OMU IV',
        'Running',
        { text: '2 ready, 9h', tone: 'caution' },
        { text: 'Level 2', tone: 'bad' },
        '412',
        '7',
        'Kira Vex',
      ],
    },
    {
      key: '4h',
      cells: ['4-HWWF II', 'Running', 'None', 'Level 0', '96', '2', 'Toma Reyes'],
    },
    {
      key: 'cj',
      tone: 'warning',
      cells: [
        'C-J6MT V',
        { text: 'Disabled', tone: 'caution' },
        'None',
        'Level 0',
        '0',
        '11',
        'Toma Reyes',
      ],
    },
  ],
};

/** What the width fit keeps: the first `count` columns by priority (stand-in for the measured fit). */
function fitted(count: number): TableModel {
  const columns = DENS.columns.slice(0, count);
  return {
    ...DENS,
    columns,
    rows: DENS.rows.map((r) => ({ ...r, cells: r.cells.slice(0, count) })),
  };
}

/** Columns the fit keeps per size on a 1440 desktop (S ≈ 270px, M ≈ 360px, L ≈ 550px, Full ≈ 1120px). */
const FIT: Record<WidgetSize, number> = { S: 2, M: 3, L: 6, F: 7 };
/** A full-width widget on a 390 phone (≈ 350px). */
const PHONE_FIT = 3;

const NUMBER: KindView['number'] = {
  value: '1',
  unit: 'den reinforced',
  tone: 'warning',
  secondary: { text: 'Efa VII, out in 14h', tone: 'caution' },
  notes: ['3 operations ready across 4 dens'],
};

const NUMBER_VIEW = sample({ number: NUMBER, summary: '1 den reinforced' });
const tableView = (count: number) => sample({ number: NUMBER, table: fitted(count) });

const COMING_UP_VIEW = sample({
  number: { value: '4', unit: 'coming up', tone: 'clear' },
  table: {
    columns: [
      { key: 'what', label: 'What' },
      { key: 'kind', label: 'Kind' },
      { key: 'when', label: 'In', align: 'end' },
    ],
    rows: [
      { key: 'mto', tone: 'warning', cells: ['X-7OMU IV den', 'Operation expires', '9h'] },
      { key: 'rf', tone: 'critical', cells: ['Efa VII den', 'Leaves reinforcement', '14h'] },
      { key: 'skill', cells: ['Mercenary Den Management V', 'Skill training', '1d 2h'] },
      { key: 'mto2', cells: ['Efa VII den', 'Operation expires', '1d 4h'] },
    ],
  },
});

const widget = (over: Partial<WidgetModel>): WidgetModel => ({
  id: 'w',
  kind: 'planetary',
  view: 'table',
  title: 'Mercenary dens',
  size: 'M',
  scope: 'header',
  showOnPhone: true,
  ...over,
});
const noop = () => {};

/** One grid cell at the real grid's flex rule for its size; `exact` stops it growing past its basis. */
function Cell({
  size,
  phone,
  exact,
  children,
}: {
  size: WidgetSize;
  phone: boolean;
  exact?: boolean;
  children: ReactNode;
}) {
  return <div style={{ ...flexRule(size, phone), ...(exact && { flexGrow: 0 }) }}>{children}</div>;
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap" style={{ gap: GRID_GAP }}>
      {children}
    </div>
  );
}

function Page({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl space-y-3 px-4 py-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-text-dim">{note}</p>
      {children}
    </div>
  );
}

function Overview({ phone }: { phone: boolean }) {
  return (
    <Page
      title="Overview"
      note="Scope: All characters. On This character the Character column is not offered."
    >
      <Grid>
        <Cell size="L" phone={phone}>
          <NewComponent name="mercenaryDens (Table, L)">
            <Widget
              widget={widget({ id: 't', size: 'L' })}
              previewView={tableView(phone ? PHONE_FIT : FIT.L)}
              onRemove={noop}
            />
          </NewComponent>
        </Cell>
        <Cell size="S" phone={phone}>
          <NewComponent name="mercenaryDens (Number)">
            <Widget
              widget={widget({ id: 'n', size: 'S', view: 'number' })}
              previewView={NUMBER_VIEW}
              onRemove={noop}
            />
          </NewComponent>
        </Cell>
        <Cell size="L" phone={phone}>
          <Widget
            widget={widget({ id: 'c', kind: 'comingUp', title: 'Coming up', size: 'L' })}
            previewView={COMING_UP_VIEW}
            onRemove={noop}
          />
        </Cell>
      </Grid>
      <p className="text-sm text-text-dim">
        Reinforcement ends and operation expiries feed the header's Next button.
      </p>
    </Page>
  );
}

const SIZES: WidgetSize[] = ['S', 'M', 'L', 'F'];

function Sizes() {
  return (
    <Page
      title="Table at each size"
      note="Each box at its own size's width. Columns drop by priority until the table fits: never a sideways scroll."
    >
      <Grid>
        {SIZES.map((size) => (
          <Cell key={size} size={size} phone={false} exact>
            <NewComponent name={`Fit ${size}: ${FIT[size]} of 7`}>
              <Widget
                widget={widget({ id: size, size })}
                previewView={tableView(FIT[size])}
                onRemove={noop}
              />
            </NewComponent>
          </Cell>
        ))}
      </Grid>
    </Page>
  );
}

function Level({
  label,
  level,
  amount,
  note,
}: {
  label: string;
  level: number;
  amount: number;
  note?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>
          {label} <Pill>Level {level}</Pill>
        </span>
        <span className="tabular-nums text-text-dim">{amount} / 100</span>
      </div>
      <ProgressBar value={amount} label={label} />
      {note && <p className="mt-1 text-xs text-text-dim">{note}</p>}
    </div>
  );
}

function DenModal() {
  return (
    <Modal open onClose={noop} title="Efa VII mercenary den">
      <NewComponent name="MercenaryDenModal">
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Pill tone="danger">Reinforced</Pill>
              <span>Comes out in 14h</span>
            </div>
            <p className="text-xs text-text-dim">
              Keys can't be taken until the den's shields repair above 50%.
            </p>
          </div>
          <StatChips>
            <StatChip label="Infomorphs" value="184" />
            <StatChip label="Character" value="Kira Vex" />
            <StatChip label="Skyhook owner" value="Ashfall Holdings" />
          </StatChips>
          <div className="space-y-3">
            <Eyebrow>Evolution</Eyebrow>
            <Level label="Development" level={3} amount={74} />
            <Level
              label="Anarchy"
              level={1}
              amount={62}
              note="At level 2 the den takes workforce from the skyhook. Run an operation to lower it."
            />
          </div>
          <div className="space-y-2">
            <Eyebrow>Operations</Eyebrow>
            <ul className="divide-y divide-line text-sm">
              <li className="flex justify-between py-1.5">
                <span>
                  <Pill tone="warning">Available</Pill> Operation 1
                </span>
                <span className="tabular-nums text-text-dim">expires in 1d 4h</span>
              </li>
              <li className="flex justify-between py-1.5">
                <span>
                  <Pill>Completed</Pill> Operation 2
                </span>
                <span className="tabular-nums text-text-dim">3d ago</span>
              </li>
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost">Set destination</Button>
            <Link to={routeToHref(30004767)} className="text-sm text-accent hover:underline">
              Route Safety (4 jumps)
            </Link>
          </div>
        </div>
      </NewComponent>
    </Modal>
  );
}

const phone = { viewport: { value: 'mobile1', isRotated: false } };

const meta = {
  title: 'mockups/MercenaryDens',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/' } },
  render: () => <Overview phone={false} />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Mercenary dens on the Overview (Table at L, Number at S). New component: mercenaryDens widget kind. */
export const OverviewPlacement: Story = {};

/** @summary The Overview on a phone: the full-width table keeps Planet, State and Operations. */
export const OverviewPlacementPhone: Story = {
  render: () => <Overview phone />,
  globals: phone,
};

/** @summary The table at S, M, L and Full on a desktop: columns drop to fit, no sideways scroll. New component: width-fit columns. */
export const TableSizes: Story = { render: () => <Sizes /> };

/** @summary The Detailed row modal: state, shields note, evolution bars, operations list, actions. New component: MercenaryDenModal. */
export const ModalDetailed: Story = {
  render: () => (
    <>
      <Overview phone={false} />
      <DenModal />
    </>
  ),
};

/** @summary The Detailed row modal on a phone. */
export const ModalDetailedPhone: Story = {
  render: () => (
    <>
      <Overview phone />
      <DenModal />
    </>
  ),
  globals: phone,
};
