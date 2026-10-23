import type { KindView, TableCell } from '@/features/overview/widgets/data/types';

const OK = { loading: false, needsPermission: false, error: false, hasData: true, isEmpty: false };

interface Hook {
  key: string;
  planet: string;
  system: string;
  open: boolean;
  /** Plain countdown: closes in (open) or opens in (not yet). */
  clock: string;
  jumps: number;
  heldBy: string;
  yours?: boolean;
  /** An open window nearly shut: less than the 10-minute link takes. */
  late?: boolean;
}

export const HOOKS: Hook[] = [
  {
    key: 'a',
    planet: 'X-7OMU VI',
    system: 'X-7OMU',
    open: true,
    clock: '38m',
    jumps: 3,
    heldBy: 'Fraternity.',
  },
  {
    key: 'b',
    planet: '1DQ1-A II',
    system: '1DQ1-A',
    open: true,
    clock: '9m',
    jumps: 5,
    heldBy: 'Goonswarm Federation',
    late: true,
  },
  {
    key: 'c',
    planet: '49-U6U IV',
    system: '49-U6U',
    open: false,
    clock: '1h 12m',
    jumps: 6,
    heldBy: 'Your alliance',
    yours: true,
  },
  {
    key: 'd',
    planet: 'T5ZI-S III',
    system: 'T5ZI-S',
    open: false,
    clock: '2h 05m',
    jumps: 8,
    heldBy: 'Brave Collective',
  },
];

const word = (h: Hook) => (h.open ? `Open, closes in ${h.clock}` : `Opens in ${h.clock}`);

function windowCell(h: Hook): TableCell {
  if (h.yours) return { text: word(h), tone: 'caution' };
  if (h.open) return { text: word(h), tone: h.late ? 'caution' : 'good' };
  return word(h);
}

const base = {
  status: OK,
  fetchedAt: new Date(Date.now() - 4 * 60_000),
  fromCache: false,
  deadlines: [],
  to: null,
} satisfies Pick<KindView, 'status' | 'fetchedAt' | 'fromCache' | 'deadlines' | 'to'>;

const hunterColumns = (withHeld: boolean) => [
  { key: 'skyhook', label: 'Skyhook', priority: 0, nameFloor: true, sortable: true },
  { key: 'window', label: 'Window', priority: 1, sortable: true },
  { key: 'jumps', label: 'Jumps', align: 'end' as const, priority: 2, sortable: true },
  ...(withHeld ? [{ key: 'held', label: 'Held by', priority: 3, sortable: true }] : []),
];

/** Hunter view: opportunity framing (open = go, green), never the defender's red. */
export function hunterView(opts: {
  withHeld: boolean;
  footer?: string;
  yours?: boolean;
}): KindView {
  const hooks = HOOKS.filter((h) => opts.yours === true || h.yours !== true);
  const first = hooks[0]!;
  return {
    ...base,
    number: {
      value: String(hooks.length),
      unit: 'raidable within 8 jumps',
      secondary: {
        text: `${first.system} open now, closes in ${first.clock}, ${first.jumps} jumps`,
        tone: 'good',
      },
      notes: ['Windows reach a few hours ahead'],
      tone: 'clear',
    },
    rows: hooks.map((h) => ({
      key: h.key,
      title: h.planet,
      value: word(h),
      tone: 'clear' as const,
    })),
    table: {
      columns: hunterColumns(opts.withHeld),
      footer: opts.footer,
      rows: hooks.map((h) => ({
        key: h.key,
        cells: [
          h.planet,
          windowCell(h),
          String(h.jumps),
          ...(opts.withHeld
            ? [h.yours ? { text: 'Your alliance', tone: 'caution' as const } : h.heldBy]
            : []),
        ],
        sort: [h.planet, h.open ? 0 : 1, h.jumps, h.heldBy],
        tone: 'clear' as const,
      })),
    },
    summary: `${hooks.length} raidable skyhooks within 8 jumps`,
  };
}

/** Today's sovRaids for contrast: own alliance, defender framing (open = red). */
export function todayView(): KindView {
  const rows = [
    { key: 'm1', planet: '49-U6U IV', open: true, clock: '21m', jumps: 6 },
    { key: 'm2', planet: '49-U6U II', open: false, clock: '1h 12m', jumps: 6 },
  ];
  return {
    ...base,
    number: {
      value: '2',
      unit: 'raidable',
      secondary: { text: '49-U6U IV open now, 6 jumps', tone: 'bad' },
      tone: 'critical',
    },
    rows: rows.map((r) => ({ key: r.key, title: r.planet, value: '', tone: 'critical' as const })),
    table: {
      columns: hunterColumns(false),
      rows: rows.map((r) => ({
        key: r.key,
        cells: [
          r.planet,
          r.open
            ? { text: `Open, closes in ${r.clock}`, tone: 'bad' as const }
            : { text: `Opens in ${r.clock}`, tone: 'caution' as const },
          String(r.jumps),
        ],
        sort: [r.planet, r.open ? 0 : 1, r.jumps],
        tone: r.open ? ('critical' as const) : ('warning' as const),
      })),
    },
    summary: '2 raidable skyhooks in your alliance space',
  };
}

export function emptyView(message: string, hint?: string): KindView {
  return {
    ...base,
    status: { ...OK, isEmpty: true },
    number: { value: '0', tone: 'clear' },
    rows: [],
    emptyMessage: message,
    emptyHint: hint,
    summary: message,
  };
}

/** routeSafety carrying the skyhook condition (#4833 owns the build; context only). */
export function routeView(): KindView {
  const rows = [
    ['Efa', 'Clear', '0'],
    ['X-7OMU', 'Raidable skyhook, open, closes in 38m', '3'],
    ['49-U6U', 'Raidable skyhook, opens in 1h 12m', '6'],
    ['Amarr', 'Clear', '9'],
  ] as const;
  return {
    ...base,
    number: { value: '2', unit: 'conditions on route', tone: 'warning' },
    rows: rows.map(([s, c], i) => ({ key: `r${i}`, title: s, value: c, tone: 'clear' as const })),
    table: {
      columns: [
        { key: 'system', label: 'System', priority: 0, nameFloor: true },
        { key: 'cond', label: 'Condition', priority: 1, grow: true },
        { key: 'jumps', label: 'Jump', align: 'end' as const, priority: 2 },
      ],
      rows: rows.map(([s, c, j], i) => ({
        key: `r${i}`,
        cells: [s, c === 'Clear' ? c : { text: c, tone: 'caution' as const }, j],
        tone: c === 'Clear' ? ('clear' as const) : ('warning' as const),
      })),
    },
    summary: 'Efa to Amarr: 2 conditions',
  };
}
