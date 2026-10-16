import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Link } from 'react-router-dom';
import { entityLinkClassName } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { CharacterHeader } from '@/features/character/CharacterHeader';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { OverviewCustomize } from '@/features/overview/OverviewHeader';
import type { ChartModel } from '@/features/overview/widgets/charts/types';
import type { KindView, NumberModel, TableModel } from '@/features/overview/widgets/data/types';
import { flexRule, GRID_GAP, PHONE_GRID_GAP } from '@/features/overview/widgets/gridStyle';
import type { Widget as WidgetModel } from '@/features/overview/widgets/layout';
import { Widget } from '@/features/overview/widgets/Widget';
import { WidgetMenu } from '@/features/overview/widgets/WidgetMenu';
import { useIsPhone } from '@/lib/useIsPhone';
import type { FixtureRoute } from '@/storybook/fixtureFetch';
import { walletFixtureRoutes } from '@/storybook/esiFixtureRoutes';
import { SAMPLE_ACTIVE_CHARACTER, SAMPLE_CHARACTERS } from '@/storybook/sampleData';
import { NewComponent } from './NewComponent';

/**
 * Proposal (T1, T4, T6b, T7, T8 Overview parts): the Overview grid with the
 * market and industry widget changes, each a real `Widget` frame drawing
 * sample figures (the Gallery's preview path), in the grid's own flex rows.
 *
 * - Open orders, Number view: a "Work through" link that opens Open Orders
 *   with the queue started (§6c: no typed arrow, a trailing caret instead).
 * - Industry, Number view: a "6 slots free" line. Chart view (All
 *   characters): free slots per Character as bars, beside a Character ·
 *   Manufacturing · Science · Reactions table of free/max.
 * - Trading profit (new kind): Number, Chart (margin per day) and Table
 *   (Item · Sales · Margin), All characters, 30 days.
 * - Below-market contracts (new kind): Number and Table, header Character
 *   (jumps are from its location), no range.
 * - Price watch, Table view: a "vs 90d" column, amber at +20% or more.
 * - "Realized profit" renamed "Build profit" (kind id unchanged).
 *
 * Stand-ins: a widget frame only draws a kind it knows, and the "All
 * characters" readout only a kind that sums across Characters. So Trading
 * profit and the All-characters Industry tile use the `miningYield` frame,
 * Below-market contracts the `contracts` frame, each with its title set. The
 * shipped kinds get their own ids (Industry joins the summing kinds, T4).
 *
 * New components in this mockup: `WorkThroughLink` (the link under the Open
 * orders number), `TradingProfitWidget` and `BelowMarketWidget` (new
 * widget kinds). The free-slots line, the per-Character slots table and the
 * vs 90d column are data on existing widget bodies, not new components.
 */

const noop = () => undefined;

const OK_STATUS: KindView['status'] = {
  loading: false,
  needsPermission: false,
  error: false,
  hasData: true,
  isEmpty: false,
};

function view(parts: {
  number: NumberModel;
  to: string;
  table?: TableModel;
  chart?: ChartModel;
}): KindView {
  return {
    status: OK_STATUS,
    fetchedAt: null,
    fromCache: false,
    rows: [],
    deadlines: [],
    summary: '',
    ...parts,
  };
}

function widget(
  id: string,
  kind: string,
  size: WidgetModel['size'],
  viewMode: WidgetModel['view'],
  extra: Partial<WidgetModel> = {}
): WidgetModel {
  return { id, kind, size, view: viewMode, scope: 'header', showOnPhone: true, ...extra };
}

// --- Sample figures ---------------------------------------------------------

/** 30 days of trading margin, millions of ISK, oldest first; sums to 132. */
const MARGIN_PER_DAY = [
  3.1, 4.8, 2.2, -1.4, 5.6, 6.9, 3.3, 1.8, 7.4, 4.1, 2.7, 0.9, 5.2, 8.8, 3.6, -2.1, 4.4, 6.1, 3.9,
  2.4, 5.7, 7.2, 4.6, 1.3, 6.4, 5.1, 3.8, 4.9, 6.3, 3.8,
];

const ORDERS_NUMBER: NumberModel = {
  value: '12',
  unit: 'undercut',
  secondary: { text: 'of 40 open · 2 expire in 6h' },
  tone: 'warning',
};

const INDUSTRY_NUMBER_TODAY: NumberModel = {
  value: '3',
  unit: 'jobs ready',
  secondary: { text: '2 more finish in 5h' },
  tone: 'clear',
};

const INDUSTRY_JOBS_TABLE: TableModel = {
  columns: [
    { key: 'job', label: 'Job', nameFloor: true },
    { key: 'activity', label: 'Activity', priority: 2 },
    { key: 'ends', label: 'Ends in', align: 'end', priority: 1 },
  ],
  rows: [
    { key: 'a', cells: ['Rifter', 'Manufacturing', 'Ready'] },
    { key: 'b', cells: ['Gila', 'Manufacturing', 'Ready'] },
    { key: 'c', cells: ['Hurricane', 'Manufacturing', '5h 02m'] },
    { key: 'd', cells: ['Hammerhead II', 'Manufacturing', '9h 40m'] },
  ],
};

const INDUSTRY_SLOTS_TABLE: TableModel = {
  columns: [
    { key: 'character', label: 'Character', nameFloor: true },
    { key: 'mfg', label: 'Manufacturing', align: 'end', priority: 1 },
    { key: 'sci', label: 'Science', align: 'end', priority: 2 },
    { key: 'react', label: 'Reactions', align: 'end', priority: 3 },
  ],
  rows: [
    { key: 'kv', cells: ['Kestrel Vane', '3/11', '2/11', '1/5'] },
    { key: 'ot', cells: ['Orsa Tellemar', '5/10', '0/9', '0/0'] },
  ],
  footer: 'Free / max slots per activity',
};

const PRICE_WATCH_NUMBER: NumberModel = {
  value: '1',
  unit: 'alert triggered',
  secondary: { text: 'Nearest: Nocxium, 4% away' },
  tone: 'clear',
};

function priceWatchTable(with90d: boolean): TableModel {
  const rows: { key: string; cells: TableModel['rows'][number]['cells']; vs90d: string }[] = [
    { key: 'plex', cells: ['PLEX', 'Hit', '4.10M', '≤ 4.20M'], vs90d: '−3%' },
    { key: 'nocx', cells: ['Nocxium', '4%', '1,920', '≤ 1,850'], vs90d: '+35%' },
    { key: 'trit', cells: ['Tritanium', '12%', '5.20', '≤ 4.60'], vs90d: '+8%' },
    { key: 'lsi', cells: ['Large Skill Injector', '6%', '812M', '≤ 765M'], vs90d: '+22%' },
    { key: 'zyd', cells: ['Zydrine', '9%', '1,140', '≤ 1,040'], vs90d: '−11%' },
  ];
  return {
    columns: [
      { key: 'item', label: 'Item', nameFloor: true },
      { key: 'gap', label: 'Gap', align: 'end', priority: 1 },
      { key: 'now', label: 'Now', align: 'end', priority: 3 },
      { key: 'target', label: 'Target', align: 'end', priority: 4 },
      ...(with90d ? [{ key: 'vs90d', label: 'vs 90d', align: 'end' as const, priority: 2 }] : []),
    ],
    rows: rows.map(({ key, cells, vs90d }) => {
      const pct = Number(vs90d.replace('−', '-').replace('%', ''));
      return {
        key,
        cells: with90d
          ? [...cells, pct >= 20 ? { text: vs90d, tone: 'caution' as const } : vs90d]
          : cells,
      };
    }),
  };
}

const BUILD_PROFIT_VIEW = view({
  to: '/industry/log',
  number: {
    value: '1.12B',
    iskAmount: 1_120_000_000,
    unit: 'ISK',
    secondary: { text: 'This month · +18%', direction: 'up', tone: 'good' },
    tone: 'clear',
  },
  chart: {
    kind: 'bars',
    summary: 'Build profit per week',
    values: [180, 260, -90, 330, 140],
    gains: true,
    barLabels: ['+180M', '+260M', '-90M', '+330M', '+140M'],
    max: '330M',
    xStart: '5 weeks ago',
    xEnd: 'This week',
  },
});

const TRADING_NUMBER: NumberModel = {
  value: '+132M',
  unit: 'ISK · 30 days',
  secondary: { text: 'Broker fees 18M', tone: 'caution' },
  notes: ['41 of 45 sales matched'],
  tone: 'clear',
};

const TRADING_CHART_VIEW = view({
  to: '/market/history',
  number: TRADING_NUMBER,
  chart: {
    kind: 'bars',
    summary: 'Trading margin per day, last 30 days',
    values: MARGIN_PER_DAY,
    gains: true,
    max: '8.8M',
    xStart: '30 days ago',
    xEnd: 'Today',
    note: 'Margin per day',
  },
});

const TRADING_TABLE_VIEW = view({
  to: '/market/history',
  number: TRADING_NUMBER,
  table: {
    columns: [
      { key: 'item', label: 'Item', nameFloor: true },
      { key: 'sales', label: 'Sales', align: 'end', priority: 2 },
      { key: 'margin', label: 'Margin', align: 'end', priority: 1 },
    ],
    rows: [
      ['Hammerhead II', '14', '+38.2M'],
      ['Nanite Repair Paste', '9', '+27.5M'],
      ['Large Skill Injector', '3', '+24.1M'],
      ['Federation Navy Stasis Webifier', '6', '+18.4M'],
      ['Medium Armor Repairer II', '8', '+12.6M'],
      ['Caldari Navy Mjolnir Light Missile', '5', '+11.2M'],
    ].map(([item, sales, margin], i) => ({
      key: `t${i}`,
      cells: [item, sales, { text: margin, tone: 'good' as const }],
    })),
    footer: '41 of 45 sales matched · broker fees 18M not subtracted',
  },
});

const BELOW_NUMBER: NumberModel = {
  value: '5',
  unit: 'below market',
  secondary: { text: 'best +42M · 3 jumps away', tone: 'good' },
  tone: 'clear',
};

const BELOW_TABLE_VIEW = view({
  to: '/contracts/search/items?belowMarket=1',
  number: BELOW_NUMBER,
  table: {
    columns: [
      { key: 'item', label: 'Item', nameFloor: true },
      { key: 'profit', label: 'Profit', align: 'end', priority: 1 },
      { key: 'jumps', label: 'Jumps', align: 'end', priority: 2 },
    ],
    rows: [
      ['Rifter + 12 more', '+42.0M', '3'],
      ['Tengu', '+18.6M', '7'],
      ['Hulk + 4 more', '+11.2M', '12'],
      ['Damage Control II ×40', '+4.1M', '0'],
      ['Gila Blueprint (copy)', '+2.8M', '5'],
    ].map(([item, profit, jumps], i) => ({
      key: `b${i}`,
      cells: [item, { text: profit, tone: 'good' as const }, jumps],
    })),
    footer: 'Contract snapshot 2h old',
  },
});

// --- Tiles ------------------------------------------------------------------

interface Tile {
  widget: WidgetModel;
  view: KindView;
  /** Wraps the tile in a `NewComponent` label. */
  newName?: string;
  /** Under the body (the frame's strip slot). */
  footer?: ReactNode;
}

function WorkThroughLink() {
  return (
    <div className="px-3 pb-2.5 max-sm:[&>[data-new-component]]:pt-9">
      <NewComponent name="WorkThroughLink">
        <Link
          to="/market/orders?workThrough=1"
          className={entityLinkClassName('inline-flex items-center gap-0.5 text-[0.8125rem]')}
        >
          Work through (12)
          <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        </Link>
      </NewComponent>
    </div>
  );
}

const ordersTile = (proposed: boolean): Tile => ({
  widget: widget('orders', 'orders', 'S', 'number'),
  view: view({ to: '/market/orders', number: ORDERS_NUMBER }),
  footer: proposed ? <WorkThroughLink /> : undefined,
});

const industryNumberTile = (proposed: boolean): Tile => ({
  widget: widget('industry-n', 'industry', 'S', 'number'),
  view: view({
    to: '/industry/jobs',
    number: proposed
      ? { ...INDUSTRY_NUMBER_TODAY, notes: ['6 slots free'] }
      : INDUSTRY_NUMBER_TODAY,
  }),
});

const priceWatchTile = (proposed: boolean): Tile => ({
  widget: widget('price-watch', 'priceWatch', proposed ? 'L' : 'M', 'table'),
  view: view({ to: '/market', number: PRICE_WATCH_NUMBER, table: priceWatchTable(proposed) }),
});

const buildProfitTile = (proposed: boolean): Tile => ({
  widget: widget('profit', 'profit', 'M', 'chart', {
    range: 30,
    ...(proposed ? { title: 'Build profit' } : {}),
  }),
  view: BUILD_PROFIT_VIEW,
});

const TODAY_TILES: Tile[] = [
  ordersTile(false),
  industryNumberTile(false),
  {
    widget: widget('industry-t', 'industry', 'M', 'table'),
    view: view({ to: '/industry/jobs', number: INDUSTRY_NUMBER_TODAY, table: INDUSTRY_JOBS_TABLE }),
  },
  priceWatchTile(false),
  buildProfitTile(false),
];

const PROPOSED_TILES: Tile[] = [
  ordersTile(true),
  industryNumberTile(true),
  {
    widget: widget('trading-n', 'miningYield', 'S', 'number', {
      title: 'Trading profit',
      scope: 'all',
      range: 30,
    }),
    view: view({ to: '/market/history', number: TRADING_NUMBER }),
    newName: 'TradingProfitWidget',
  },
  {
    widget: widget('below-n', 'contracts', 'S', 'number', { title: 'Below-market contracts' }),
    view: view({ to: '/contracts/search/items?belowMarket=1', number: BELOW_NUMBER }),
    newName: 'BelowMarketWidget',
  },
  {
    widget: widget('industry-c', 'miningYield', 'F', 'chart', { title: 'Industry', scope: 'all' }),
    view: view({
      to: '/industry/jobs',
      number: {
        ...INDUSTRY_NUMBER_TODAY,
        secondary: { text: '11 slots free on 2 Characters' },
      },
      chart: {
        kind: 'hbars',
        summary: 'Free slots per Character',
        note: 'Free slots per Character, all activities',
        rows: [
          { key: 'kv', label: 'Kestrel Vane', share: 1, text: '6 of 27 free' },
          { key: 'ot', label: 'Orsa Tellemar', share: 5 / 6, text: '5 of 19 free' },
        ],
      },
      table: INDUSTRY_SLOTS_TABLE,
    }),
  },
  {
    widget: widget('trading-c', 'miningYield', 'M', 'chart', {
      title: 'Trading profit',
      scope: 'all',
      range: 30,
    }),
    view: TRADING_CHART_VIEW,
    newName: 'TradingProfitWidget',
  },
  {
    widget: widget('trading-t', 'miningYield', 'M', 'table', {
      title: 'Trading profit',
      scope: 'all',
      range: 30,
    }),
    view: TRADING_TABLE_VIEW,
    newName: 'TradingProfitWidget',
  },
  {
    widget: widget('below-t', 'contracts', 'M', 'table', { title: 'Below-market contracts' }),
    view: BELOW_TABLE_VIEW,
    newName: 'BelowMarketWidget',
  },
  priceWatchTile(true),
  buildProfitTile(true),
];

function Board({ tiles }: { tiles: Tile[] }) {
  const isPhone = useIsPhone();
  return (
    <div
      className="flex min-w-0 flex-wrap items-stretch"
      style={{ gap: isPhone ? PHONE_GRID_GAP : GRID_GAP }}
    >
      {tiles.map((tile) => {
        const frame = (
          <Widget
            widget={tile.widget}
            previewView={tile.view}
            onRemove={noop}
            menu={<WidgetMenu widget={tile.widget} inert />}
            editControls={tile.footer}
          />
        );
        return (
          <div
            key={tile.widget.id}
            className="flex min-w-0"
            style={flexRule(tile.widget.size, isPhone)}
          >
            {tile.newName ? (
              <div
                className={
                  tile.widget.size === 'S'
                    ? // Two halves on a phone: the label wraps to two lines.
                      'flex w-full min-w-0 [&>div]:w-full max-sm:[&>[data-new-component]]:pt-9'
                    : 'flex w-full min-w-0 [&>div]:w-full'
                }
              >
                <NewComponent name={tile.newName}>{frame}</NewComponent>
              </div>
            ) : (
              frame
            )}
          </div>
        );
      })}
    </div>
  );
}

function OverviewPage({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <CharacterHeader
        characterId={SAMPLE_ACTIVE_CHARACTER.characterId}
        overview
        actions={<OverviewCustomize />}
      />
      <OverviewSubNav />
      <Board tiles={tiles} />
    </div>
  );
}

/** The wallet answers plus the header's public character and corporation reads. */
function overviewRoutes(): FixtureRoute[] {
  return [
    ...walletFixtureRoutes(),
    {
      path: /^\/characters\/\d+\/?$/,
      respond: ({ url }) => {
        const id = Number(url.pathname.split('/')[2]);
        const c = SAMPLE_CHARACTERS.find((s) => s.characterId === id) ?? SAMPLE_ACTIVE_CHARACTER;
        return {
          body: {
            name: c.name,
            corporation_id: c.corporationId,
            birthday: '2015-03-14T12:00:00Z',
            gender: 'female',
            race_id: 2,
            bloodline_id: 4,
            security_status: 1.2,
          },
        };
      },
    },
    {
      path: /^\/corporations\/\d+\/?$/,
      respond: () => ({
        body: {
          name: SAMPLE_ACTIVE_CHARACTER.corporationName,
          ticker: 'BRSM',
          member_count: 14,
          ceo_id: SAMPLE_ACTIVE_CHARACTER.characterId,
          creator_id: SAMPLE_ACTIVE_CHARACTER.characterId,
          tax_rate: 0.1,
        },
      }),
    },
  ];
}

const meta = {
  title: 'mockups/OverviewMarketIndustryWidgets',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    shell: { path: '/overview', routes: overviewRoutes },
  },
  render: () => <OverviewPage tiles={PROPOSED_TILES} />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Proposed Overview: Work through link, Industry free slots, Trading profit and Below-market contracts widgets, Price watch vs 90d, Build profit. New components: WorkThroughLink, TradingProfitWidget, BelowMarketWidget. */
export const Proposed: Story = {};

/** @summary The proposal in the phone shell. */
export const ProposedPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Today's widgets for comparison: Open orders, Industry, Price watch, Realized profit. */
export const Today: Story = {
  render: () => <OverviewPage tiles={TODAY_TILES} />,
};

/** @summary Today's widgets in the phone shell. */
export const TodayPhone: Story = {
  render: () => <OverviewPage tiles={TODAY_TILES} />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
