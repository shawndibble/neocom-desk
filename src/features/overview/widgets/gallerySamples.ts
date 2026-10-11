/**
 * Static sample data for the Gallery's previews: one `KindView` per kind, so
 * the preview is the real `Widget` drawing sample figures, not a picture of one.
 *
 * Pure data (no fetch, no stores), and deliberately language-neutral: figures,
 * EVE proper nouns and units that read the same in any locale, so nothing here
 * needs i18n. A kind with no sample gets no preview (the Gallery then shows the
 * description alone), which is also what a coming-soon kind gets.
 */
import type { KindView, ListRow } from './data/types';

type Row = readonly [title: string, detail: string, value: string];

interface Sample {
  value: string;
  /** An ISK figure: the widget draws it as shorthand. */
  isk?: number;
  unit?: string;
  rows: readonly Row[];
}

const SAMPLES: Record<string, Sample> = {
  training: {
    value: '2d 4h',
    rows: [
      ['Gunnery V', 'Training now', '2d 4h'],
      ['Spaceship Command V', 'Next', '5d 1h'],
    ],
  },
  sp: { value: '86.2M', unit: 'SP', rows: [['Unallocated', '', '1.2M']] },
  location: {
    value: 'Jita',
    rows: [
      ['Caracal', 'Ship', ''],
      ['0.9', 'Security', ''],
    ],
  },
  clones: {
    value: 'Efa',
    rows: [
      ['Efa', 'Finishes your queue first', '6d 2h'],
      ['Amarr', '', '7d 9h'],
    ],
  },
  wallet: {
    value: '1.24B',
    isk: 1_240_000_000,
    rows: [['Balance', '', '1.24B']],
  },
  walletFlow: {
    value: '+312M',
    unit: 'ISK',
    rows: [
      ['Income', '', '+1.1B'],
      ['Spending', '', '-790M'],
    ],
  },
  netWorth: {
    value: '5.6B',
    isk: 5_600_000_000,
    rows: [
      ['Wallet', '', '1.2B'],
      ['Assets', '', '3.9B'],
      ['Sell orders', '', '500M'],
    ],
  },
  orders: {
    value: '3',
    unit: 'undercut',
    rows: [
      ['Compressed Veldspar', 'Jita', '3.2M'],
      ['Tritanium', 'Amarr', '410K'],
    ],
  },
  priceWatch: {
    value: '2',
    unit: 'fired',
    rows: [
      ['PLEX', 'Below target', '4.1M'],
      ['Nocxium', 'Above target', '1.9K'],
    ],
  },
  stock: {
    value: '4',
    unit: 'low',
    rows: [
      ['Nanite Repair Paste', 'Jita', '12 of 50'],
      ['Tritanium', 'Amarr', '8M of 10M'],
    ],
  },
  lp: {
    value: '48.2K',
    rows: [
      ['Sisters of EVE', '', '31.0K'],
      ['Caldari Navy', '', '17.2K'],
    ],
  },
  miningTax: {
    value: '84M',
    isk: 84_000_000,
    rows: [['Owed this month', '', '84M']],
  },
  industry: {
    value: '2',
    unit: 'ready',
    rows: [
      ['Rifter', 'Manufacturing', 'Ready'],
      ['Gila', 'Manufacturing', '3h 12m'],
    ],
  },
  profit: {
    value: '1.8B',
    isk: 1_800_000_000,
    rows: [
      ['Rifter', '', '120M'],
      ['Gila', '', '340M'],
    ],
  },
  miningYield: {
    value: '210M',
    unit: 'ISK/day',
    rows: [
      ['Scordite', '', '90M'],
      ['Veldspar', '', '70M'],
    ],
  },
  planetary: {
    value: '3',
    unit: 'colonies',
    rows: [
      ['Efa IV', 'Extractor runs dry', '2d 4h'],
      ['Efa VI', 'Extractor runs dry', '5d 1h'],
    ],
  },
  structures: {
    value: '2',
    unit: 'timers',
    rows: [['Astrahus', 'Reinforced', '1d 3h']],
  },
  moonChunks: {
    value: '1',
    unit: 'ready',
    rows: [['Athanor', 'Chunk ready', 'Now']],
  },
  incursions: {
    value: '3',
    unit: 'jumps',
    rows: [['Sansha incursion', 'Nearest system', '3 jumps']],
  },
  comingUp: {
    value: '2',
    unit: 'today',
    rows: [
      ['Fleet op', '', '19:00'],
      ['Alliance meeting', '', '21:30'],
    ],
  },
  contracts: {
    value: '1',
    unit: 'courier',
    rows: [['Jita to Amarr', 'In progress', '2d 1h']],
  },
  mail: {
    value: '7',
    unit: 'unread',
    rows: [
      ['Corp recruitment', 'Sender One', '1h'],
      ['Fleet invite', 'Sender Two', '3h'],
    ],
  },
};

export function hasSample(kind: string): boolean {
  return kind in SAMPLES;
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
    number: { value: sample.value, iskAmount: sample.isk, unit: sample.unit, tone: 'clear' },
    rows,
    deadlines: [],
    summary: '',
    to: null,
  };
}
