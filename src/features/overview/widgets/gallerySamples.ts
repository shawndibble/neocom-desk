/**
 * Sample data for the Gallery's previews: one `KindView` per kind, so the
 * preview is the real widget body drawing sample figures, not a picture of
 * one.
 *
 * Pure data (no fetch, no stores). Figures and EVE proper nouns are literal;
 * every word of prose goes through the `t` the caller passes in
 * (`overview.gallery.samples.*`, or the matching `overview.widgets.*` phrase
 * where the live widget already says the same thing). The cast is the
 * mockup's pilot (Efa, a Muninn, a Jita to Amarr run), so every preview tells
 * the same self-consistent story. A kind with no sample gets no preview (the
 * Gallery then shows the description alone), which is also what a coming-soon
 * kind gets.
 */
import type { TFunction } from 'i18next';
import type { ChartModel } from './charts/types';
import type { KindView, ListRow } from './data/types';
import { swing } from '@/features/overview/samplePilot';

type Row = readonly [title: string, detail: string, value: string];

interface Sample {
  value: string;
  /** An ISK figure: the widget draws it as shorthand. */
  isk?: number;
  unit?: string;
  note?: string;
  rows: readonly Row[];
  chart?: ChartModel;
}

/** A gently wobbling run from `from` to `to`: the same on every render, so a preview never twitches. */
function series(count: number, from: number, to: number, wobble = 0.06): number[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 1 : i / (count - 1);
    const base = from + (to - from) * t;
    return Math.round(base * (1 + wobble * swing(i, 2.3, from)) * 100) / 100;
  });
}

const hbars = (rows: [label: string, share: number, text: string][]): ChartModel => ({
  kind: 'hbars',
  summary: '',
  rows: rows.map(([label, share, text], i) => ({ key: `r${i}`, label, share, text })),
});

function buildSamples(t: TFunction): Record<string, Sample> {
  const vol = (amount: string) => t('overview.widgets.data.survey.volume', { amount });
  return {
    training: {
      value: '4h 12m',
      note: t('overview.gallery.samples.training.note'),
      rows: [
        ['Advanced Industry V', t('overview.widgets.training.now'), '4h 12m'],
        ['Spaceship Command V', t('overview.widgets.training.next'), '1d 3h'],
        ['Gunnery V', t('overview.gallery.samples.training.then'), '5d 2h'],
      ],
      chart: hbars([
        ['Advanced Indus...', 0.08, '4h 12m'],
        ['Spaceship Com...', 0.28, '1d 3h'],
        ['Gunnery V', 1, '5d 2h'],
      ]),
    },
    sp: {
      value: '214.6M',
      unit: t('overview.widgets.sp.unit'),
      note: t('overview.gallery.samples.sp.note'),
      rows: [
        [t('overview.gallery.samples.sp.total'), '', '214.6M'],
        [t('overview.gallery.samples.sp.unallocated'), '', '0.4M'],
        [t('overview.gallery.samples.sp.week'), '', '+0.9M'],
      ],
    },
    location: {
      value: 'Efa',
      note: t('overview.gallery.samples.location.note'),
      rows: [
        [
          t('overview.widgets.data.location.system'),
          t('overview.widgets.data.location.security', { value: '0.3' }),
          'Efa',
        ],
        [t('overview.widgets.data.location.ship'), 'Heavy Assault Cruiser', 'Muninn'],
        [
          t('overview.gallery.samples.location.status'),
          '',
          t('overview.gallery.samples.location.docked'),
        ],
      ],
    },
    jumpTimers: {
      value: '3h 20m',
      note: t('overview.gallery.samples.jumpTimers.note'),
      rows: [
        [t('overview.widgets.jumpTimers.clone'), '', '3h 20m'],
        [t('overview.widgets.jumpTimers.fatigue'), '', t('overview.widgets.jumpTimers.none')],
      ],
    },
    clones: {
      value: 'Jita Alpha',
      note: t('overview.gallery.samples.clones.note'),
      rows: [
        ['Jita Alpha', t('overview.gallery.samples.clones.first'), '2d 4h'],
        ['Efa Athanor', t('overview.widgets.data.clones.current'), '5d 2h'],
        ['Amarr', '', '6d 9h'],
      ],
    },
    wallet: {
      value: '3.82B',
      isk: 3_820_000_000,
      unit: 'ISK',
      note: t('overview.gallery.samples.wallet.note'),
      rows: [
        [t('overview.gallery.samples.wallet.balance'), '', '3.82B'],
        [t('overview.gallery.samples.sp.week'), '', '+212M'],
      ],
      chart: {
        kind: 'area',
        summary: '',
        values: series(30, 3.5, 3.82, 0.012),
        low: '3.5B',
        high: '3.8B',
        rangeLabel: t('overview.widgets.chart.span', { count: 30 }),
      },
    },
    walletFlow: {
      value: '+232M',
      unit: t('overview.gallery.samples.walletFlow.unit'),
      note: t('overview.gallery.samples.walletFlow.note'),
      rows: [
        [t('overview.gallery.samples.walletFlow.income'), '', '+292M'],
        [t('overview.gallery.samples.walletFlow.spending'), '', '-60M'],
        [t('overview.gallery.samples.walletFlow.net'), '', '+232M'],
      ],
      chart: {
        kind: 'bars',
        summary: '',
        values: [40, -18, 62, 25, -30, 88],
        gains: true,
        barLabels: ['+40M', '-18M', '+62M', '+25M', '-30M', '+88M'],
        max: '88M',
        xStart: t('overview.widgets.chart.weeksAgo', { count: 6 }),
        xEnd: t('overview.widgets.chart.thisWeek'),
      },
    },
    netWorth: {
      value: '41.6B',
      unit: 'ISK',
      note: t('overview.gallery.samples.netWorth.note'),
      rows: [
        [t('overview.gallery.samples.netWorth.wallet'), '', '3.8B'],
        [t('overview.gallery.samples.netWorth.assets'), '', '34.9B'],
        [t('overview.gallery.samples.netWorth.orders'), '', '2.9B'],
      ],
      chart: {
        kind: 'stack',
        summary: '',
        parts: [
          {
            key: 'assets',
            label: t('overview.gallery.samples.netWorth.assets'),
            value: 34.9,
            text: '34.9B',
            color: 's1',
          },
          {
            key: 'isk',
            label: t('overview.gallery.samples.netWorth.wallet'),
            value: 3.8,
            text: '3.8B',
            color: 'accent',
          },
          {
            key: 'orders',
            label: t('overview.gallery.samples.netWorth.orders'),
            value: 2.9,
            text: '2.9B',
            color: 's3',
          },
        ],
      },
    },
    orders: {
      value: '21',
      unit: t('overview.gallery.samples.orders.unit'),
      note: t('overview.gallery.samples.orders.note'),
      rows: [
        ['Compressed Veldspar', t('overview.gallery.samples.orders.jitaUndercut'), '3.2M'],
        ['Tritanium', t('overview.gallery.samples.orders.amarrUndercut'), '410K'],
        ['Nocxium', 'Jita', '1.9K'],
      ],
      chart: {
        kind: 'stack',
        summary: '',
        parts: [
          {
            key: 'healthy',
            label: t('overview.widgets.chart.ordersStates.healthy'),
            value: 12,
            text: '12',
            color: 'neutral',
          },
          {
            key: 'undercut',
            label: t('overview.widgets.chart.ordersStates.undercut'),
            value: 21,
            text: '21',
            color: 'warning',
          },
          {
            key: 'outbid',
            label: t('overview.widgets.chart.ordersStates.outbid'),
            value: 3,
            text: '3',
            color: 's1',
          },
          {
            key: 'expiring',
            label: t('overview.widgets.chart.ordersStates.expiring'),
            value: 2,
            text: '2',
            color: 's2',
          },
        ],
      },
    },
    priceWatch: {
      value: '1',
      unit: t('overview.gallery.samples.priceWatch.unit'),
      note: t('overview.gallery.samples.priceWatch.note'),
      rows: [
        ['PLEX', t('overview.gallery.samples.priceWatch.below'), '4.1M'],
        ['Nocxium', t('overview.gallery.samples.priceWatch.armed'), '1.9K'],
        ['Tritanium', t('overview.gallery.samples.priceWatch.armed'), '5.2'],
      ],
    },
    stock: {
      value: t('overview.gallery.samples.stock.value'),
      unit: t('overview.gallery.samples.stock.unit'),
      note: t('overview.gallery.samples.stock.note'),
      rows: [
        ['Nanite Repair Paste', 'Jita', t('overview.gallery.samples.stock.of50')],
        ['Tritanium', 'Amarr', t('overview.gallery.samples.stock.of10M')],
        ['Compressed Veldspar', 'Dodixie', t('overview.gallery.samples.stock.of40')],
      ],
      chart: hbars([
        ['Jita', 0.35, t('overview.gallery.samples.stock.out2')],
        ['Amarr', 0.6, t('overview.gallery.samples.stock.low3')],
        ['Dodixie', 1, t('overview.widgets.chart.stock.ok')],
      ]),
    },
    lp: {
      value: '1.84M',
      unit: t('overview.widgets.data.lp.unit'),
      note: t('overview.widgets.data.lp.corporations', { count: 3 }),
      rows: [
        ['Sisters of EVE', '', '1.12M'],
        ['Caldari Navy', '', '540K'],
        ['Kaalakiota', '', '180K'],
      ],
      chart: hbars([
        ['Sisters of EVE', 1, '1.12M'],
        ['Caldari Navy', 0.48, '540K'],
        ['Kaalakiota', 0.16, '180K'],
      ]),
    },
    miningTax: {
      value: '14.2M',
      isk: 14_200_000,
      unit: t('overview.gallery.samples.miningTax.unit'),
      note: t('overview.gallery.samples.miningTax.note'),
      rows: [
        ['Aria Nox', t('overview.gallery.samples.miningTax.days', { count: 3 }), '8.1M'],
        ['Jin Maro', t('overview.gallery.samples.miningTax.days', { count: 2 }), '4.4M'],
        [
          t('overview.gallery.samples.miningTax.hangar'),
          t('overview.gallery.samples.miningTax.days', { count: 1 }),
          '1.7M',
        ],
      ],
    },
    industry: {
      value: '3',
      unit: t('overview.gallery.samples.industry.unit'),
      note: t('overview.gallery.samples.industry.note'),
      rows: [
        [
          'Rifter',
          t('overview.gallery.samples.industry.manufacturing'),
          t('overview.gallery.samples.industry.ready'),
        ],
        [
          'Gila',
          t('overview.gallery.samples.industry.manufacturing'),
          t('overview.gallery.samples.industry.ready'),
        ],
        ['Hurricane', t('overview.gallery.samples.industry.manufacturing'), '5h 02m'],
      ],
      chart: ((): ChartModel => {
        const ready = t('overview.gallery.samples.industry.ready');
        const fallback = hbars([
          ['Rifter', 1, ready],
          ['Gila', 1, ready],
          ['Hurricane', 0.4, '5h 02m'],
        ]);
        const note = t('overview.widgets.chart.industry.ganttNote');
        return {
          kind: 'gantt',
          rows: [
            { key: 'a', label: 'Rifter', startMs: 0, endMs: 5, text: ready, color: 'warning' },
            { key: 'b', label: 'Gila', startMs: 1, endMs: 6, text: ready, color: 'warning' },
            {
              key: 'c',
              label: 'Hurricane',
              startMs: 4,
              endMs: 12,
              text: '5h 02m',
              color: 'accent',
            },
          ],
          axis: { from: 0, to: 14, now: 7 },
          labels: {
            from: t('overview.widgets.chart.industry.ganttAgo', { duration: '7h' }),
            now: t('overview.widgets.chart.industry.ganttNow'),
            to: t('overview.widgets.chart.industry.ganttIn', { duration: '7h' }),
          },
          note,
          summary: note,
          fallback: fallback as Extract<ChartModel, { kind: 'hbars' }>,
        };
      })(),
    },
    profit: {
      value: '1.12B',
      isk: 1_120_000_000,
      unit: 'ISK',
      note: t('overview.gallery.samples.profit.note'),
      rows: [
        ['Rifter', '', '120M'],
        ['Gila', '', '340M'],
        ['Hurricane', '', '660M'],
      ],
      chart: {
        kind: 'bars',
        summary: '',
        values: [180, 260, -90, 330, 140],
        gains: true,
        barLabels: ['+180M', '+260M', '-90M', '+330M', '+140M'],
        max: '330M',
        xStart: t('overview.widgets.chart.weeksAgo', { count: 5 }),
        xEnd: t('overview.widgets.chart.thisWeek'),
      },
    },
    tradingProfit: {
      value: '+132M',
      isk: 132_000_000,
      unit: t('overview.widgets.data.tradingProfit.unit', { count: 30 }),
      note: t('overview.gallery.samples.tradingProfit.note'),
      rows: [
        ['Damage Control II', '', '+58M'],
        ['Tritanium', '', '+41M'],
        ['Gila', '', '+33M'],
      ],
      chart: {
        kind: 'bars',
        summary: '',
        values: [20, 35, -10, 48, 39],
        gains: true,
        barLabels: ['+20M', '+35M', '-10M', '+48M', '+39M'],
        max: '48M',
        xStart: t('overview.widgets.chart.daysAgo', { count: 5 }),
        xEnd: t('overview.widgets.chart.today'),
      },
    },
    miningYield: {
      value: '58M',
      unit: t('overview.widgets.data.miningYield.unit'),
      note: t('overview.gallery.samples.miningYield.note'),
      rows: [
        ['Scordite', '', '24M'],
        ['Veldspar', '', '21M'],
        ['Pyroxeres', '', '13M'],
      ],
      chart: {
        kind: 'bars',
        summary: '',
        values: series(14, 40, 70, 0.3),
        max: '74M',
        xStart: t('overview.widgets.chart.daysAgo', { count: 14 }),
        xEnd: t('overview.widgets.chart.today'),
      },
    },
    hauling: {
      value: '48M',
      unit: t('overview.widgets.data.hauling.unit'),
      note: t('overview.gallery.samples.hauling.note'),
      rows: [
        ['Jita → Amarr', '12 jumps', '48M'],
        ['Jita → Dodixie', '9 jumps', '31M'],
        ['Amarr → Jita', '12 jumps', '22M'],
      ],
    },
    belowMarket: {
      value: '5',
      unit: t('overview.widgets.data.belowMarket.unit'),
      note: t('overview.gallery.samples.belowMarket.note'),
      rows: [
        ['Rifter + 12 more', '3 jumps', '+42M'],
        ['Tengu', '7 jumps', '+18.6M'],
        ['Hulk + 4 more', '12 jumps', '+11.2M'],
      ],
    },
    survey: {
      value: '2h 14m',
      unit: t('overview.widgets.data.survey.unit'),
      note: t('overview.gallery.samples.survey.note'),
      rows: [
        ['Arkonor', '', vol('6.4K')],
        ['Bistot', '', vol('4.1K')],
        ['Veldspar', '', vol('1.2K')],
      ],
      chart: hbars([
        ['Arkonor', 1, vol('6.4K')],
        ['Bistot', 0.64, vol('4.1K')],
        ['Veldspar', 0.19, vol('1.2K')],
      ]),
    },
    routeSafety: {
      value: '2',
      unit: t('overview.widgets.data.routeSafety.unit', { count: 2 }),
      note: t('overview.gallery.samples.routeSafety.note'),
      rows: [
        ['Niarja', '', '9'],
        ['Uedama', '', '6'],
        ['Sivala', '', '2'],
      ],
      chart: {
        kind: 'bars',
        summary: '',
        values: [1, 0, 2, 1, 3, 2, 0, 1, 4, 3, 2, 5, 3, 2, 1, 0, 2, 3, 4, 6, 3, 2, 1, 2],
        max: t('overview.widgets.chart.routeSafety.max', { count: 6 }),
        xStart: t('overview.widgets.chart.routeSafety.xStart'),
        xEnd: t('overview.widgets.chart.routeSafety.xEnd'),
      },
    },
    kills: {
      value: '14',
      unit: t('overview.widgets.data.kills.unit', { count: 14 }),
      note: t('overview.gallery.samples.kills.note'),
      rows: [
        ['Vexor', 'Efa', '48M'],
        ['Catalyst', 'Niarja', '12M'],
        ['Tengu', 'Amarr', '410M'],
      ],
      chart: {
        kind: 'bars',
        summary: '',
        values: [0, 2, 1, 0, 3, 1, 4, 0, 1, 2, 0, 0],
        max: t('overview.widgets.chart.kills.max', { count: 4 }),
        xStart: t('overview.widgets.chart.kills.xStart', { count: 30 }),
        xEnd: t('overview.widgets.chart.kills.xEnd'),
      },
    },
    omega: {
      value: t('overview.widgets.data.omega.covers', { count: 2 }),
      unit: t('overview.widgets.data.omega.figures', { days: 30, net: '2.2B', cost: '1B' }),
      note: t('overview.widgets.data.omega.next', { days: 30, amount: '800M' }),
      rows: [],
      chart: {
        kind: 'omega',
        summary: '',
        bars: [0.4, 0.9, 1.3, 1.1, 1.6, 2.2].map((net, i) => ({
          key: `p${i}`,
          label: t(
            i === 0
              ? 'overview.widgets.chart.omega.tickPartial'
              : 'overview.widgets.chart.omega.tick',
            {
              date: `${i + 1}`,
            }
          ),
          net: net * 1e9,
          partial: i === 0,
          tip: { title: '', rows: [] },
        })),
        lines: [1, 2, 3].map((count) => ({
          value: count * 1e9,
          label: t('overview.widgets.chart.omega.line', { count }),
        })),
      },
    },
    planetary: {
      value: '4',
      unit: t('overview.gallery.samples.planetary.unit'),
      note: t('overview.gallery.samples.planetary.note'),
      rows: [
        ['Efa IV', t('overview.gallery.samples.planetary.runsDry'), '2h 10m'],
        ['Efa VI', t('overview.gallery.samples.planetary.runsDry'), '1d 4h'],
        ['Efa II', t('overview.gallery.samples.planetary.runsDry'), '3d 1h'],
      ],
      chart: hbars([
        ['Efa IV', 0.1, '2h 10m'],
        ['Efa VI', 0.45, '1d 4h'],
        ['Efa II', 1, '3d 1h'],
      ]),
    },
    structures: {
      value: '1',
      unit: t('overview.gallery.samples.structures.unit'),
      note: t('overview.gallery.samples.structures.note'),
      rows: [
        ['Efa Athanor', t('overview.gallery.samples.structures.fuel'), '3d 4h'],
        ['Efa Astrahus', t('overview.gallery.samples.structures.fuel'), '19d'],
      ],
      chart: hbars([
        ['Efa Athanor', 0.16, '3d 4h'],
        ['Efa Astrahus', 1, '19d'],
      ]),
    },
    moonChunks: {
      value: '11h',
      unit: t('overview.gallery.samples.moonChunks.unit'),
      note: t('overview.gallery.samples.moonChunks.note'),
      rows: [
        ['Efa VI - Moon 4', t('overview.gallery.samples.moonChunks.arrives'), '11h'],
        ['Efa VII - Moon 1', t('overview.gallery.samples.moonChunks.drilling'), '3d'],
      ],
    },
    corpDeadlines: {
      value: '1',
      unit: t('corp.standing.dueSoon'),
      note: t('overview.widgets.corpDeadlines.next', { name: 'Efa VI - Moon 4', when: '11h' }),
      rows: [
        ['Efa VI - Moon 4', t('corp.board.detail.moonArrival'), '11h'],
        ['Efa Athanor', t('corp.board.detail.fuel'), '3d 4h'],
        ['Efa Astrahus', t('corp.board.detail.fuel'), '19d'],
      ],
      chart: {
        kind: 'bars',
        summary: '',
        values: [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        max: '1',
        xStart: t('corp.standing.strip.today'),
        xEnd: 'Nov 2',
        note: t('overview.widgets.corpDeadlines.chartNote', { days: 14 }),
      },
    },
    corpServices: {
      value: '3',
      unit: t('overview.widgets.corpServices.unit'),
      note: t('overview.widgets.corpServices.most', { name: 'Efa Astrahus', count: 2 }),
      rows: [
        ['Efa Astrahus', 'Standup Market Hub I', t('overview.board.structureOffline')],
        ['Efa Astrahus', 'Standup Manufacturing Plant I', t('overview.board.structureOffline')],
        ['Efa Athanor', 'Standup Reprocessing Facility I', t('overview.board.structureOffline')],
      ],
    },
    corpStarbases: {
      value: '4',
      unit: t('overview.widgets.corpStarbases.unit'),
      note: t('overview.widgets.corpStarbases.lowest', { name: 'Efa', duration: '1d 6h' }),
      rows: [
        [
          'Caldari Control Tower',
          'Efa',
          t('overview.widgets.corpStarbases.fuelCell', { blocks: '1,248', duration: '1d 6h' }),
        ],
        [
          'Amarr Control Tower Medium',
          'Jita',
          t('overview.widgets.corpStarbases.fuelCell', { blocks: '2,940', duration: '6d 3h' }),
        ],
      ],
    },
    corpSovereignty: {
      value: '2',
      unit: t('overview.widgets.corpSovereignty.unit', { count: 2 }),
      note: t('overview.widgets.corpSovereignty.opensIn', { duration: '6h' }),
      rows: [
        ['X-7OMU', t('overview.widgets.corpSovereignty.windowIn', { duration: '6h' }), '2 / 1 / 3'],
        ['Efa', t('overview.widgets.corpSovereignty.windowIn', { duration: '1d 4h' }), '4 / 0 / 2'],
      ],
    },
    corpJobs: {
      value: '3',
      unit: t('overview.widgets.corpJobs.unit'),
      note: t('overview.widgets.corpJobs.ready', { count: 1 }),
      rows: [
        [
          t('overview.board.jobSubject', { name: 'Rifter', count: 20 }),
          t('industry.activity.manufacturing'),
          t('overview.board.ready'),
        ],
        [
          t('overview.board.jobSubject', { name: 'Gila', count: 5 }),
          t('industry.activity.manufacturing'),
          '1d 3h',
        ],
        [
          t('overview.board.jobSubject', { name: 'Hurricane', count: 10 }),
          t('industry.activity.manufacturing'),
          '5h 02m',
        ],
      ],
      chart: hbars([
        [
          t('overview.board.jobSubject', { name: 'Rifter', count: 20 }),
          0,
          t('overview.board.ready'),
        ],
        [t('overview.board.jobSubject', { name: 'Gila', count: 5 }), 1, '1d 3h'],
        [t('overview.board.jobSubject', { name: 'Hurricane', count: 10 }), 0.19, '5h 02m'],
      ]),
    },
    corpWallet: {
      value: '12.4B',
      isk: 12_400_000_000,
      unit: 'ISK',
      note: t('overview.widgets.corpWallet.biggest', { name: 'Master Wallet', share: 64 }),
      rows: [
        ['Master Wallet', '', '7.9B'],
        ['Industry', '', '3.1B'],
        ['Taxes', '', '1.4B'],
      ],
      chart: hbars([
        ['Master Wallet', 1, '64%'],
        ['Industry', 0.39, '25%'],
        ['Taxes', 0.18, '11%'],
      ]),
    },
    corpCashFlow: {
      value: '+1.4B',
      isk: 1_400_000_000,
      unit: t('overview.widgets.corpCashFlow.unit'),
      note: t('overview.widgets.corpCashFlow.runway', { count: 86 }),
      rows: [
        [t('overview.widgets.corpCashFlow.col.in'), '', '+1.9B'],
        [t('overview.widgets.corpCashFlow.col.out'), '', '-0.5B'],
        [t('overview.widgets.corpCashFlow.col.net'), '', '+1.4B'],
      ],
      chart: {
        kind: 'bars',
        summary: '',
        values: [210, 340, -80, 190, 280, 150, 310],
        gains: true,
        barLabels: ['+210M', '+340M', '-80M', '+190M', '+280M', '+150M', '+310M'],
        max: t('overview.widgets.chart.max', { value: '340M' }),
        xStart: t('overview.widgets.chart.daysAgo', { count: 7 }),
        xEnd: t('overview.widgets.chart.today'),
        note: t('overview.widgets.corpCashFlow.chartNote'),
      },
    },
    corpIncome: {
      value: '1.9B',
      isk: 1_900_000_000,
      unit: t('overview.widgets.corpIncome.unit'),
      note: t('overview.widgets.corpIncome.top', {
        name: t('overview.widgets.corpIncome.refType.bounty_prizes'),
        share: 58,
      }),
      rows: [
        [t('overview.widgets.corpIncome.refType.bounty_prizes'), '', '1.1B'],
        [t('overview.widgets.corpIncome.refType.industry_job_tax'), '', '470M'],
        [t('overview.widgets.corpIncome.refType.market_transaction'), '', '330M'],
      ],
      chart: hbars([
        [t('overview.widgets.corpIncome.refType.bounty_prizes'), 1, '58%'],
        [t('overview.widgets.corpIncome.refType.industry_job_tax'), 0.43, '25%'],
        [t('overview.widgets.corpIncome.refType.market_transaction'), 0.3, '17%'],
      ]),
    },
    corpMembers: {
      value: '42',
      unit: t('overview.widgets.corpMembers.unit', { count: 42 }),
      note: t('overview.widgets.corpMembers.secondary', { joined: 2, left: 1 }),
      rows: [
        ['Aria Nox', '', t('overview.widgets.corpMembers.joined')],
        ['Jin Maro', '', t('overview.widgets.corpMembers.joined')],
        ['Tessa Vorn', '', t('overview.widgets.corpMembers.left')],
      ],
      chart: {
        kind: 'bars',
        summary: '',
        values: [1, 0, 2, 1, 0, 3, 2, 1, 4, 2, 3, 2],
        max: t('overview.widgets.corpMembers.chart.max', { value: 4 }),
        xStart: t('overview.widgets.corpMembers.chart.monthsAgo', { count: 11 }),
        xEnd: t('overview.widgets.corpMembers.chart.thisMonth'),
        note: t('overview.widgets.corpMembers.chart.note'),
      },
    },
    corpInactive: {
      value: '3',
      unit: t('overview.widgets.corpInactive.unit', { count: 3 }),
      note: t('overview.widgets.corpInactive.threshold', { days: 30 }),
      rows: [
        ['Dax Orlen', '', '64d'],
        ['Lio Verr', '', '41d'],
        ['Kael Ordo', '', '33d'],
      ],
    },
    corpMining: {
      value: '1.84M',
      unit: t('overview.widgets.corpMining.unit'),
      note: t('overview.widgets.corpMining.topMiner', {
        name: 'Aria Nox',
        share: t('overview.widgets.corpMining.percent', { value: 47 }),
      }),
      rows: [
        ['Aria Nox', '', '865K'],
        ['Jin Maro', '', '540K'],
        ['Dax Orlen', '', '435K'],
      ],
      chart: hbars([
        ['Aria Nox', 1, '47%'],
        ['Jin Maro', 0.62, '29%'],
        ['Dax Orlen', 0.5, '24%'],
      ]),
    },
    corpOrders: {
      value: '14',
      unit: t('overview.widgets.corpOrders.unit', { count: 14 }),
      note: t('overview.widgets.corpOrders.escrow', { isk: '3.4B' }),
      rows: [
        ['Tritanium', 'Jita', '5.1'],
        ['Compressed Veldspar', 'Amarr', '14.2'],
        ['Nocxium', 'Jita', '1.9K'],
      ],
    },
    corpContracts: {
      value: '7',
      unit: t('overview.widgets.corpContracts.unit'),
      note: t('overview.widgets.corpContracts.expiringSoon', { count: 2 }),
      rows: [
        ['Jita to Efa haul', t('contracts.typeCourier'), '5h 10m'],
        ['Rifter fleet stock', t('contracts.typeItemExchange'), '1d 3h'],
        ['Efa to Amarr haul', t('contracts.typeCourier'), '2d 8h'],
      ],
    },
    corpAssets: {
      value: '3',
      unit: t('overview.widgets.corpAssets.unit', { count: 3 }),
      rows: [
        [
          t('overview.widgets.corpAssets.line.safety'),
          t('overview.widgets.corpAssets.safetyCount', { count: 12 }),
          '4.2B',
        ],
        [
          t('overview.widgets.corpAssets.line.deliveries'),
          t('overview.widgets.corpAssets.deliveriesCount', { count: 3 }),
          '',
        ],
        [
          t('overview.widgets.corpAssets.line.belowTarget'),
          t('overview.widgets.corpAssets.belowTargetCount', { count: 5 }),
          '',
        ],
      ],
    },
    corpCustomsOffices: {
      value: '3',
      unit: t('overview.widgets.corpCustomsOffices.unit', { count: 3 }),
      note: t('overview.widgets.corpCustomsOffices.systems', { count: 2 }),
      rows: [
        [
          'Customs Office',
          'Efa',
          t('overview.widgets.corpCustomsOffices.window', { start: '18', end: '20' }),
        ],
        [
          'Customs Office',
          'Niarja',
          t('overview.widgets.corpCustomsOffices.window', { start: '02', end: '04' }),
        ],
        [
          'Customs Office',
          'Niarja',
          t('overview.widgets.corpCustomsOffices.window', { start: '14', end: '16' }),
        ],
      ],
    },
    corpRoleAudit: {
      value: '3',
      unit: t('overview.widgets.corpRoleAudit.unit', { count: 3 }),
      note: t('overview.widgets.corpRoleAudit.changes', { count: 2, days: 7 }),
      rows: [
        ['Aria Voss', 'Director', '2d 4h'],
        ['Kerr Dane', 'Accountant, Trader', '5d 1h'],
        ['Mina Oto', 'Station Manager', '—'],
      ],
    },
    corpKills: {
      value: '1,284',
      unit: t('overview.widgets.corpKills.unit', { count: 1284 }),
      note: t('overview.widgets.corpKills.secondary', { losses: '312', efficiency: '81%' }),
      rows: [],
    },
    incursions: {
      value: '6',
      unit: t('overview.gallery.samples.incursions.unit'),
      note: 'Vale of the Silent',
      rows: [
        [
          'Vale of the Silent',
          t('overview.gallery.samples.incursions.established'),
          t('overview.gallery.samples.incursions.jumps', { count: 6 }),
        ],
        [
          'Tash-Murkon',
          t('overview.gallery.samples.incursions.mobilizing'),
          t('overview.gallery.samples.incursions.jumps', { count: 14 }),
        ],
      ],
    },
    comingUp: {
      value: '1h 20m',
      note: t('overview.gallery.samples.comingUp.note'),
      rows: [
        [
          t('overview.gallery.samples.comingUp.fleet'),
          t('overview.gallery.samples.comingUp.forms'),
          '1h 20m',
        ],
        [t('overview.gallery.samples.comingUp.meeting'), '', '3h 10m'],
      ],
    },
    contracts: {
      value: '2',
      unit: t('overview.gallery.samples.contracts.unit'),
      note: t('overview.gallery.samples.contracts.note'),
      rows: [
        [
          t('overview.gallery.samples.contracts.route'),
          t('overview.gallery.samples.contracts.courier'),
          '9h 05m',
        ],
        [
          t('overview.gallery.samples.contracts.exchange'),
          t('overview.gallery.samples.contracts.outstanding'),
          '2d',
        ],
      ],
    },
    mail: {
      value: '3',
      unit: t('overview.gallery.samples.mail.unit'),
      note: t('overview.gallery.samples.mail.note'),
      rows: [
        [t('overview.gallery.samples.mail.doctrine'), 'Aria Nox', '2h'],
        [t('overview.gallery.samples.mail.payday'), t('overview.gallery.samples.mail.corp'), '5h'],
        [t('overview.gallery.samples.mail.contract'), 'Jin Maro', '1d'],
      ],
    },
  };
}

/** Whether a kind's preview draws a chart: it then previews its Chart view, else its List. */
export function sampleHasChart(kind: string, t: TFunction): boolean {
  return buildSamples(t)[kind]?.chart !== undefined;
}

export function sampleView(kind: string, t: TFunction): KindView | undefined {
  const sample = buildSamples(t)[kind];
  if (!sample) return undefined;
  const rows: ListRow[] = sample.rows.map(([title, detail, value], i) => ({
    key: `${kind}-${i}`,
    title,
    detail: detail || undefined,
    value,
    tone: 'clear',
  }));
  return {
    status: { loading: false, needsPermission: false, error: false, hasData: true, isEmpty: false },
    fetchedAt: null,
    fromCache: false,
    number: {
      value: sample.value,
      iskAmount: sample.isk,
      unit: sample.unit,
      secondary: sample.note ? { text: sample.note } : undefined,
      tone: 'clear',
    },
    rows,
    deadlines: [],
    summary: '',
    to: null,
    chart: sample.chart,
  };
}
