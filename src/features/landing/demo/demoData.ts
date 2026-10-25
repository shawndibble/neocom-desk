/**
 * The sample reads behind the landing page's Overview demo, and the Widget
 * Views built from them.
 *
 * The data is raw: the same shapes the live feeds hold (a wallet journal, a
 * skill queue, a calendar, open orders), and the Views come out of the app's
 * own `buildView`, so a demo card reads, rounds and words things exactly as
 * the real one does and follows it when a builder changes. Only Open orders
 * is assembled by hand around the real table and chart builders, because its
 * feed is a market snapshot that cannot be faked small.
 *
 * Pure: nothing here fetches, reads a store or touches Dexie. Every figure
 * hangs off `now`, so the sample always looks freshly read. The cast is
 * fictional (Aurelia Vex of Deep Space Transport); the systems, ships and
 * skills are New Eden's own.
 */
import type { TFunction } from 'i18next';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';
import type { CalendarEventSummary, SkillQueueEntry, WalletJournalEntry } from '@/esi/endpoints';
import type { CachedResult } from '@/esi/cache';
import type { OrderProblem } from '@/engine/market/orderProblems';
import { summarizeSurvey, type SurveyScan } from '@/engine/survey/series';
import { ordersSeverity } from '@/features/overview/data/boardSeverity';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import type { SkillCatalog } from '@/features/skills/skillMap';
import { blank, statusOf } from '@/features/overview/widgets/data/builderKit';
import { buildView } from '@/features/overview/widgets/data/models';
import { wobble } from '@/features/overview/samplePilot';
import { ordersStateChart, ordersTable } from '@/features/overview/widgets/data/ordersModels';
import type { Feeds, FeedState, KindView, Translate } from '@/features/overview/widgets/data/types';
import type { Widget } from '@/features/overview/widgets/layout';
import { formatIskCompact } from '@/lib/isk';
import { NEXT_EVENT } from './demoCast';

/** The wallet balance the journal walks to. */
const BALANCE = 1_842_600_000;
/** What the journal nets: the first day's 1M is already in the series' first point, so the headline reads "+342.3M in 27 days". */
const NET_GAIN = 343_300_000;
const JOURNAL_DAYS = 27;

const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });

function cached<T>(data: T, fetchedAt: Date): CachedResult<T> {
  return { data, fetchedAt, fromCache: false, truncated: false };
}

/** About a month of wallet journal ending at `now`, walking to `BALANCE` and netting `NET_GAIN`. */
function journal(now: number): WalletJournalEntry[] {
  type Draft = { day: number; ref: string; amount: number };
  const drafts: Draft[] = [];
  drafts.push({ day: JOURNAL_DAYS - 1, ref: 'bounty_prizes', amount: 1e6 });
  for (let day = JOURNAL_DAYS - 2; day >= 0; day--) {
    drafts.push({ day, ref: 'bounty_prizes', amount: 6e6 + 17e6 * wobble(day, 1.7) });
    if (day % 3 === 0) {
      const sale = 38e6 + 36e6 * wobble(day, 2.3);
      drafts.push({ day, ref: 'market_transaction', amount: sale });
      drafts.push({ day, ref: 'transaction_tax', amount: -sale * 0.045 });
      drafts.push({ day, ref: 'brokers_fee', amount: -sale * 0.02 });
    }
    if (day % 7 === 3) {
      drafts.push({ day, ref: 'market_transaction', amount: -(54e6 + 30e6 * wobble(day, 3.1)) });
    }
  }
  // The weeks that make the flow chart diverge: a ship bought, a donation, two big contracts.
  drafts.push({ day: 13, ref: 'market_transaction', amount: -236e6 });
  drafts.push({ day: 9, ref: 'player_donation', amount: -48e6 });
  drafts.push({ day: 21, ref: 'contract_price_payment_corp', amount: 312e6 });
  const rest = drafts.reduce((sum, d) => sum + d.amount, 0);
  drafts.push({ day: 5, ref: 'contract_price_payment_corp', amount: NET_GAIN - rest });

  drafts.sort((a, b) => b.day - a.day || a.ref.localeCompare(b.ref));
  let balance = BALANCE - NET_GAIN;
  return drafts.map((draft, i) => {
    balance += draft.amount;
    // Spread through the day, oldest first, newest well before `now`.
    const at = now - draft.day * DAY_MS - (20 - (i % 17)) * HOUR_MS * 0.5 - 20 * MINUTE_MS;
    return {
      id: 9_000 + i,
      date: new Date(at).toISOString(),
      ref_type: draft.ref,
      description: '',
      amount: Math.round(draft.amount),
      balance: Math.round(balance),
    };
  });
}

const QUEUE: readonly { name: string; level: number; hours: number; spPerHour: number }[] = [
  { name: 'Astrogeology', level: 5, hours: 41, spPerHour: 2700 },
  { name: 'Mining Barge', level: 5, hours: 29, spPerHour: 2700 },
  { name: 'Exhumers', level: 4, hours: 33, spPerHour: 2520 },
  { name: 'Ice Harvesting', level: 4, hours: 20, spPerHour: 2520 },
  { name: 'Mining Upgrades', level: 5, hours: 66, spPerHour: 2700 },
  { name: 'Reprocessing', level: 5, hours: 52, spPerHour: 2520 },
  { name: 'Drones', level: 5, hours: 44, spPerHour: 2700 },
  { name: 'Industry', level: 5, hours: 38, spPerHour: 2700 },
  { name: 'Planetology', level: 5, hours: 61, spPerHour: 2520 },
  { name: 'Command Ships', level: 3, hours: 17, spPerHour: 2160 },
  { name: 'Hull Upgrades', level: 5, hours: 47, spPerHour: 2700 },
  { name: 'Spaceship Command', level: 5, hours: 70, spPerHour: 2700 },
];

function skills(now: number): { queue: SkillQueueEntry[]; catalog: SkillCatalog } {
  const queue: SkillQueueEntry[] = [];
  const names = new Map<number, { name: string }>();
  let start = now - 3 * HOUR_MS;
  QUEUE.forEach((skill, i) => {
    const finish = start + skill.hours * HOUR_MS;
    const sp = skill.hours * skill.spPerHour;
    names.set(1_000 + i, { name: skill.name });
    queue.push({
      skill_id: 1_000 + i,
      queue_position: i,
      finished_level: skill.level,
      start_date: new Date(start).toISOString(),
      finish_date: new Date(finish).toISOString(),
      level_start_sp: 0,
      level_end_sp: sp,
      training_start_sp: 0,
    });
    start = finish;
  });
  // The widget reads only the display name off a catalogue row.
  return { queue, catalog: { bySkillTypeID: names } as unknown as SkillCatalog };
}

/** A field mined out over a morning: the last scan shows nothing left. */
function surveyScans(now: number): SurveyScan[] {
  const rock = (ore: string, volume: number) => ({ ore, volume });
  const at = (minutesAgo: number) => now - minutesAgo * MINUTE_MS;
  return [
    {
      at: at(210),
      rocks: [
        rock('Veldspar', 41_000),
        rock('Veldspar', 38_500),
        rock('Scordite', 27_000),
        rock('Pyroxeres', 19_500),
        rock('Plagioclase', 12_000),
      ],
    },
    {
      at: at(150),
      rocks: [
        rock('Veldspar', 30_000),
        rock('Veldspar', 22_000),
        rock('Scordite', 19_000),
        rock('Pyroxeres', 11_000),
      ],
    },
    {
      at: at(95),
      rocks: [rock('Veldspar', 9_500), rock('Scordite', 8_000), rock('Pyroxeres', 3_000)],
    },
    { at: at(50), rocks: [rock('Scordite', 2_500)] },
    { at: at(12), rocks: [] },
  ];
}

const feedsAt = (now: number): Feeds => {
  const fetched = (minutesAgo: number) => new Date(now - minutesAgo * MINUTE_MS);
  const events: CalendarEventSummary[] = [
    {
      event_id: 1,
      event_date: new Date(now + NEXT_EVENT.inMs).toISOString(),
      title: NEXT_EVENT.title,
      importance: 0,
      event_response: 'accepted',
    },
    {
      event_id: 2,
      event_date: new Date(now + 3 * DAY_MS + 21 * HOUR_MS).toISOString(),
      title: 'Moon fracture: Maw of Creation',
      importance: 0,
      event_response: 'accepted',
    },
    {
      event_id: 3,
      event_date: new Date(now + 6 * DAY_MS + 2 * HOUR_MS).toISOString(),
      title: 'Hauler fleet, Jita run',
      importance: 0,
      event_response: 'tentative',
    },
  ];
  const { queue, catalog } = skills(now);
  const scans = surveyScans(now);
  return {
    wallet: ok({ result: cached(BALANCE, fetched(2)), needsReauth: false }),
    journal: ok({ result: cached(journal(now), fetched(2)), needsReauth: false }),
    calendar: ok({ events, needsReauth: false, fetchedAt: fetched(5) }),
    mining: ok({
      unpaidIsk: 17_400_000,
      payeeCount: 2,
      unassignedCount: 0,
      oldestUnpaidDays: 1,
      needsReauth: false,
      fetchedAt: fetched(7),
      payees: [
        { payeeId: 'p1', name: 'Kestrel Ward', unpaidIsk: 11_200_000, oldestDays: 1, entries: 3 },
        { payeeId: 'p2', name: 'Orrin Tavish', unpaidIsk: 6_200_000, oldestDays: 0, entries: 1 },
      ],
      characterCount: 1,
      missingCharacterNames: [],
    }),
    contracts: ok({
      summary: {
        inProgress: 1,
        exchanges: 1,
        outstanding: 1,
        dueSoon: 0,
        overdue: 0,
        soonest: null,
        items: [],
        rows: [],
      },
      route: null,
      needsReauth: false,
      fetchedAt: fetched(9),
    }),
    mail: ok({ unread: 0, recent: [], inbox: [], needsReauth: false, fetchedAt: fetched(4) }),
    location: ok({
      needsReauth: false,
      system: { id: 30_002_000, name: 'Badivefi', security: 0.7 },
      shipTypeId: 17_476,
      shipName: 'Mackinaw',
      fetchedAt: fetched(3),
    }),
    skills: ok({
      skillsResult: null,
      queueResult: cached(queue, fetched(11)),
      queueNeedsReauth: false,
      totalSp: null,
      catalog,
      maxOrders: 305,
    }),
    survey: ok({
      hasSurvey: true,
      location: 'Badivefi',
      summary: summarizeSurvey(scans),
      fetchedAt: fetched(12),
    }),
  };
};

/** The layout: four Small cards, then Medium, Large and a Full Open orders, as a fresh role starts. */
export const DEMO_WIDGETS: readonly Widget[] = [
  { id: 'd-tax', kind: 'miningTax', size: 'S', view: 'number' },
  { id: 'd-contracts', kind: 'contracts', size: 'S', view: 'number' },
  { id: 'd-mail', kind: 'mail', size: 'S', view: 'number' },
  { id: 'd-location', kind: 'location', size: 'S', view: 'number' },
  { id: 'd-coming', kind: 'comingUp', size: 'M', view: 'table' },
  { id: 'd-wallet', kind: 'wallet', size: 'M', view: 'chart', range: 30 },
  { id: 'd-survey', kind: 'survey', size: 'M', view: 'chart' },
  { id: 'd-flow', kind: 'wallet', show: 'flow', size: 'M', view: 'chart', range: 30 },
  { id: 'd-training', kind: 'training', size: 'L', view: 'table' },
  { id: 'd-orders', kind: 'orders', size: 'F', view: 'table', rowsPerPage: 5 },
].map((w) => ({ ...w, scope: 'header', showOnPhone: true }) as Widget);

type OrderSpec = [
  name: string,
  volume: number,
  price: number,
  gapPct: number,
  beatsMe: boolean,
  problem: OrderProblem,
  expiresInDays: number,
  station: string,
];

const ORDERS: readonly OrderSpec[] = [
  ['Compressed Veldspar', 410_000, 14.6, 3.2, true, 'undercutStation', 27.5, 'Amarr VIII'],
  ['Compressed Scordite', 188_000, 31.2, 1.7, true, 'undercutStation', 27.5, 'Amarr VIII'],
  ['Medium Capacitor Booster II', 12, 1_100_000, 5.3, true, 'undercutStation', 12.4, 'Jita IV'],
  ['Nanite Repair Paste', 240, 41_800, 1.9, true, 'undercutStation', 9.2, 'Jita IV'],
  ['Warp Core Stabilizer II', 4, 562_700, 1.7, true, 'undercutSystem', 21.1, 'Jita IV'],
  ['Republic Fleet Private Insignia II', 5, 53_900, 0.6, false, 'healthy', 29.4, 'Amarr VIII'],
  ['Superconductors', 570, 10_200, 1.9, true, 'undercutStation', 28.3, 'Amarr VIII'],
  ['Hobgoblin II', 30, 71_400, 0, false, 'healthy', 22.8, 'Dodixie IX'],
  ['Compressed Pyroxeres', 96_000, 22.4, 2.4, true, 'undercutRegion', 14.1, 'Amarr VIII'],
  ['Mining Laser Upgrade II', 6, 1_340_000, 0.4, false, 'healthy', 26, 'Jita IV'],
  ['Compressed Plagioclase', 54_000, 18.9, 4.1, true, 'undercutStation', 8.6, 'Amarr VIII'],
  ['Survey Scanner II', 8, 3_190_000, 0, false, 'expiringOrStale', 0.8, 'Jita IV'],
  ['Gas Cloud Scoop II', 3, 8_420_000, 0, false, 'healthy', 19.6, 'Dodixie IX'],
  ['Veldspar Blueprint Copy', 10, 540_000, 0, false, 'healthy', 24.2, 'Amarr VIII'],
];

function openOrderRows(now: number): OpenOrderRow[] {
  // Only what the Open orders widget reads; the rest of a row is the market page's.
  return ORDERS.map(
    ([typeName, volumeRemain, price, gapPct, beatsMe, problem, days, stationName], i) =>
      ({
        orderId: 70_000 + i,
        typeName,
        isBuyOrder: false,
        volumeRemain,
        price,
        stationName: `${stationName} - Moon 4 - Trade Hub`,
        expiry: { expired: false, expiresAt: now + days * DAY_MS },
        station: { bestPrice: beatsMe ? price * (1 - gapPct / 100) : price, gapPct, beatsMe },
        problem,
        problems: [problem],
        iskTiedUp: volumeRemain * price,
      }) as unknown as OpenOrderRow
  );
}

function ordersView(t: Translate, now: number): KindView {
  const rows = openOrderRows(now);
  const undercut = rows.filter((row) => row.problem.startsWith('undercut')).length;
  const listed = rows.reduce((sum, row) => sum + row.iskTiedUp, 0);
  return {
    ...blank('/market/orders', statusOf(ok(rows))),
    fetchedAt: new Date(now - 4 * MINUTE_MS),
    number: {
      value: String(undercut),
      unit: t('overview.board.undercut'),
      secondary: {
        text: t('overview.widgets.orders.listed', { isk: formatIskCompact(listed) }),
      },
      tone: ordersSeverity(rows, false) ?? 'clear',
    },
    table: ordersTable(t, rows, now, { used: rows.length, total: 305 }),
    summary: '',
    chart: ordersStateChart(t, rows) ?? undefined,
  };
}

/** One View per demo widget, keyed by widget id, as the real feeds would have built them at `now`. */
export function buildDemoViews(t: TFunction, now: number): ReadonlyMap<string, KindView> {
  const translate: Translate = (key, options) => String(t(key, options));
  const feeds = feedsAt(now);
  const views = new Map<string, KindView>();
  for (const widget of DEMO_WIDGETS) {
    views.set(
      widget.id,
      widget.kind === 'orders'
        ? ordersView(translate, now)
        : buildView(widget.kind, feeds, {
            t: translate,
            now,
            activeCharacterId: null,
            scopeAll: false,
            notTrainingAlert: false,
            range: widget.range ?? 30,
          })
    );
  }
  return views;
}
