/**
 * Static sample data for the Gallery's previews: one `KindView` per kind, so
 * the preview is the real widget body drawing sample figures, not a picture of
 * one.
 *
 * Pure data (no fetch, no stores), and deliberately language-neutral: figures,
 * EVE proper nouns and units that read the same in any locale, so nothing here
 * needs i18n. The cast is the mockup's pilot (Efa, a Muninn, a Jita to Amarr
 * run), so every preview tells the same self-consistent story. A kind with no
 * sample gets no preview (the Gallery then shows the description alone), which
 * is also what a coming-soon kind gets.
 */
import type { ChartModel } from './charts/types';
import type { KindView, ListRow } from './data/types';

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
    return Math.round(base * (1 + wobble * Math.sin(i * 2.3 + from)) * 100) / 100;
  });
}

const hbars = (rows: [label: string, share: number, text: string][]): ChartModel => ({
  kind: 'hbars',
  summary: '',
  rows: rows.map(([label, share, text], i) => ({ key: `r${i}`, label, share, text })),
});

const SAMPLES: Record<string, Sample> = {
  training: {
    value: '4h 12m',
    note: 'Advanced Industry V · 4 skills queued',
    rows: [
      ['Advanced Industry V', 'Training now', '4h 12m'],
      ['Spaceship Command V', 'Next', '1d 3h'],
      ['Gunnery V', 'Then', '5d 2h'],
    ],
    chart: hbars([
      ['Advanced Indus...', 0.08, '4h 12m'],
      ['Spaceship Com...', 0.28, '1d 3h'],
      ['Gunnery V', 1, '5d 2h'],
    ]),
  },
  sp: {
    value: '214.6M',
    unit: 'SP',
    note: '+0.9M this week',
    rows: [
      ['Total', '', '214.6M'],
      ['Unallocated', '', '0.4M'],
      ['This week', '', '+0.9M'],
    ],
  },
  location: {
    value: 'Efa',
    note: 'Muninn · docked',
    rows: [
      ['System', 'Security 0.3', 'Efa'],
      ['Ship', 'Heavy Assault Cruiser', 'Muninn'],
      ['Status', '', 'Docked'],
    ],
  },
  clones: {
    value: 'Jita Alpha',
    note: 'Finishes your queue 3d sooner',
    rows: [
      ['Jita Alpha', 'Finishes your queue first', '2d 4h'],
      ['Efa Athanor', 'Current clone', '5d 2h'],
      ['Amarr', '', '6d 9h'],
    ],
  },
  wallet: {
    value: '3.82B',
    isk: 3_820_000_000,
    unit: 'ISK',
    note: '+212M this week',
    rows: [
      ['Balance', '', '3.82B'],
      ['This week', '', '+212M'],
    ],
    chart: {
      kind: 'area',
      summary: '',
      values: series(30, 3.5, 3.82, 0.012),
      low: '3.5B',
      high: '3.8B',
      rangeLabel: '30 days',
    },
  },
  walletFlow: {
    value: '+232M',
    unit: 'ISK net',
    note: 'Income 292M · spending 60M',
    rows: [
      ['Income', '', '+292M'],
      ['Spending', '', '-60M'],
      ['Net', '', '+232M'],
    ],
    chart: {
      kind: 'bars',
      summary: '',
      values: series(14, 12, 24, 0.35),
      max: '38M',
      xStart: '14 days ago',
      xEnd: 'today',
    },
  },
  netWorth: {
    value: '41.6B',
    unit: 'ISK',
    note: '+0.8B this month',
    rows: [
      ['Wallet', '', '3.8B'],
      ['Assets', '', '34.9B'],
      ['Sell orders', '', '2.9B'],
    ],
    chart: {
      kind: 'stack',
      summary: '',
      parts: [
        { key: 'assets', label: 'Assets', value: 34.9, text: '34.9B', color: 's1' },
        { key: 'isk', label: 'Wallet', value: 3.8, text: '3.8B', color: 'accent' },
        { key: 'orders', label: 'Sell orders', value: 2.9, text: '2.9B', color: 's3' },
      ],
    },
  },
  orders: {
    value: '21',
    unit: 'undercut',
    note: 'of 38 open · 2 expire in 6h',
    rows: [
      ['Compressed Veldspar', 'Jita · undercut', '3.2M'],
      ['Tritanium', 'Amarr · undercut', '410K'],
      ['Nocxium', 'Jita', '1.9K'],
    ],
    chart: {
      kind: 'donut',
      summary: '',
      centre: '38',
      centreNote: 'open',
      parts: [
        { key: 'ok', label: 'Fine', value: 17, color: 'neutral' },
        { key: 'under', label: 'Undercut', value: 21, color: 'warning' },
      ],
    },
  },
  priceWatch: {
    value: '1',
    unit: 'alert triggered',
    note: '2 armed',
    rows: [
      ['PLEX', 'Below target', '4.1M'],
      ['Nocxium', 'Armed', '1.9K'],
      ['Tritanium', 'Armed', '5.2'],
    ],
  },
  stock: {
    value: '2 out',
    unit: '5 low',
    note: 'Across 3 hubs',
    rows: [
      ['Nanite Repair Paste', 'Jita', '0 of 50'],
      ['Tritanium', 'Amarr', '8M of 10M'],
      ['Compressed Veldspar', 'Dodixie', '2 of 40'],
    ],
    chart: hbars([
      ['Jita', 0.35, '2 out'],
      ['Amarr', 0.6, '3 low'],
      ['Dodixie', 1, 'ok'],
    ]),
  },
  lp: {
    value: '1.84M',
    unit: 'LP',
    note: '3 corporations',
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
    unit: 'ISK owed',
    note: '6 mining days not yet billed',
    rows: [
      ['Aria Nox', '3 days', '8.1M'],
      ['Jin Maro', '2 days', '4.4M'],
      ['Corp hangar', '1 day', '1.7M'],
    ],
  },
  industry: {
    value: '3',
    unit: 'jobs ready',
    note: '2 more finish in 5h',
    rows: [
      ['Rifter', 'Manufacturing', 'Ready'],
      ['Gila', 'Manufacturing', 'Ready'],
      ['Hurricane', 'Manufacturing', '5h 02m'],
    ],
    chart: hbars([
      ['Rifter', 1, 'Ready'],
      ['Gila', 1, 'Ready'],
      ['Hurricane', 0.4, '5h 02m'],
    ]),
  },
  profit: {
    value: '1.12B',
    isk: 1_120_000_000,
    unit: 'ISK',
    note: 'This month · +18%',
    rows: [
      ['Rifter', '', '120M'],
      ['Gila', '', '340M'],
      ['Hurricane', '', '660M'],
    ],
    chart: {
      kind: 'bars',
      summary: '',
      values: [180, 260, 210, 330, 140],
      max: '330M',
      xStart: '5 weeks ago',
      xEnd: 'this week',
    },
  },
  miningYield: {
    value: '58M',
    unit: 'ISK/day',
    note: 'Average over the range',
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
      xStart: '14 days ago',
      xEnd: 'today',
    },
  },
  planetary: {
    value: '4',
    unit: 'colonies run dry',
    note: 'in 2h 10m',
    rows: [
      ['Efa IV', 'Extractor runs dry', '2h 10m'],
      ['Efa VI', 'Extractor runs dry', '1d 4h'],
      ['Efa II', 'Extractor runs dry', '3d 1h'],
    ],
    chart: hbars([
      ['Efa IV', 0.1, '2h 10m'],
      ['Efa VI', 0.45, '1d 4h'],
      ['Efa II', 1, '3d 1h'],
    ]),
  },
  structures: {
    value: '1',
    unit: 'low on fuel',
    note: 'Lowest 3d 4h',
    rows: [
      ['Efa Athanor', 'Fuel', '3d 4h'],
      ['Efa Astrahus', 'Fuel', '19d'],
    ],
    chart: hbars([
      ['Efa Athanor', 0.16, '3d 4h'],
      ['Efa Astrahus', 1, '19d'],
    ]),
  },
  moonChunks: {
    value: '11h',
    unit: 'to next chunk',
    note: '2 drills',
    rows: [
      ['Efa VI - Moon 4', 'Chunk arrives', '11h'],
      ['Efa VII - Moon 1', 'Drilling', '3d'],
    ],
  },
  incursions: {
    value: '6',
    unit: 'jumps away',
    note: 'Vale of the Silent',
    rows: [
      ['Vale of the Silent', 'Established', '6 jumps'],
      ['Tash-Murkon', 'Mobilizing', '14 jumps'],
    ],
  },
  comingUp: {
    value: '1h 20m',
    note: 'Stratop fleet forms · 2 events ahead',
    rows: [
      ['Stratop fleet', 'Forms', '1h 20m'],
      ['Alliance meeting', '', '3h 10m'],
    ],
  },
  contracts: {
    value: '2',
    unit: 'couriers due',
    note: 'in 9h 05m',
    rows: [
      ['Efa to Amarr', 'Courier', '9h 05m'],
      ['Item exchange', 'Outstanding', '2d'],
    ],
  },
  mail: {
    value: '3',
    unit: 'unread',
    note: 'Aria Nox and 2 more',
    rows: [
      ['Fleet doctrine update', 'Aria Nox', '2h'],
      ['Payday', 'Corp', '5h'],
      ['Re: contract', 'Jin Maro', '1d'],
    ],
  },
};

export function hasSample(kind: string): boolean {
  return kind in SAMPLES;
}

/** Whether a kind's preview draws a chart: it then previews its Chart view, else its List. */
export function sampleHasChart(kind: string): boolean {
  return SAMPLES[kind]?.chart !== undefined;
}

export function sampleView(kind: string): KindView | undefined {
  const sample = SAMPLES[kind];
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
