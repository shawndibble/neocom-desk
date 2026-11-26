import type { TFunction } from 'i18next';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@/lib/age';
import type { SkillQueueEntry, WalletJournalEntry } from '@/esi/endpoints';
import type { CachedResult } from '@/esi/cache';
import type { OrderProblem } from '@/engine/market/orderProblems';
import { ordersSeverity } from '@/features/overview/data/boardSeverity';
import type { OpenOrderRow } from '@/features/market/openOrdersModel';
import type { SkillCatalog } from '@/features/skills/skillMap';
import { blank, statusOf } from '@/features/overview/widgets/data/builderKit';
import { buildView } from '@/features/overview/widgets/data/models';
import { settingsContext } from '@/features/overview/widgets/data/viewSettings';
import { sampleView } from '@/features/overview/widgets/gallerySamples';
import { wobble } from '@/features/overview/samplePilot';
import { ordersStateChart, ordersTable } from '@/features/overview/widgets/data/ordersModels';
import type {
  Feeds,
  FeedState,
  KindView,
  TableModel,
} from '@/features/overview/widgets/data/types';
import type { Translate } from '@/lib/translate';
import type { Widget } from '@/features/overview/widgets/layout';
import { formatIskCompact } from '@/lib/isk';

const BALANCE = 1_842_600_000;
const NET_GAIN = 343_300_000;
const JOURNAL_DAYS = 27;

const ok = <T>(data: T): FeedState<T> => ({ data, error: false, loading: false });

function cached<T>(data: T, fetchedAt: Date): CachedResult<T> {
  return { data, fetchedAt, fromCache: false, truncated: false };
}

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
  drafts.push({ day: 13, ref: 'market_transaction', amount: -236e6 });
  drafts.push({ day: 9, ref: 'player_donation', amount: -48e6 });
  drafts.push({ day: 21, ref: 'contract_price_payment_corp', amount: 312e6 });
  const rest = drafts.reduce((sum, d) => sum + d.amount, 0);
  drafts.push({ day: 5, ref: 'contract_price_payment_corp', amount: NET_GAIN - rest });

  drafts.sort((a, b) => b.day - a.day || a.ref.localeCompare(b.ref));
  let balance = BALANCE - NET_GAIN;
  return drafts.map((draft, i) => {
    balance += draft.amount;
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
  return { queue, catalog: { bySkillTypeID: names } as unknown as SkillCatalog };
}

const feedsAt = (now: number): Feeds => {
  const fetched = (minutesAgo: number) => new Date(now - minutesAgo * MINUTE_MS);
  const { queue, catalog } = skills(now);
  return {
    wallet: ok({ result: cached(BALANCE, fetched(2)), needsReauth: false }),
    journal: ok({ result: cached(journal(now), fetched(2)), needsReauth: false }),
    skills: ok({
      skillsResult: null,
      queueResult: cached(queue, fetched(11)),
      queueNeedsReauth: false,
      totalSp: null,
      catalog,
      maxOrders: 305,
    }),
  };
};

export const DEMO_WIDGETS: readonly Widget[] = [
  { id: 'd-hauling', kind: 'hauling', size: 'S', view: 'number' },
  { id: 'd-below', kind: 'belowMarket', size: 'S', view: 'number' },
  { id: 'd-watch', kind: 'priceWatch', size: 'S', view: 'number' },
  { id: 'd-planetary', kind: 'planetary', size: 'S', view: 'number' },
  { id: 'd-wallet', kind: 'wallet', size: 'M', view: 'chart', range: 30 },
  { id: 'd-profit', kind: 'profit', size: 'M', view: 'table' },
  { id: 'd-training', kind: 'training', size: 'M', view: 'table' },
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

function demoTable(table: TableModel): TableModel {
  return { ...table, rows: table.rows.map((row) => ({ ...row, to: undefined })) };
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
    table: demoTable(ordersTable(t, rows, now, { used: rows.length, total: 305 })),
    summary: '',
    chart: ordersStateChart(t, rows) ?? undefined,
  };
}

const SAMPLED_KINDS: ReadonlySet<string> = new Set([
  'hauling',
  'belowMarket',
  'priceWatch',
  'planetary',
  'profit',
]);

export function buildDemoViews(t: TFunction, now: number): ReadonlyMap<string, KindView> {
  const translate: Translate = (key, options) => String(t(key, options));
  const feeds = feedsAt(now);
  const views = new Map<string, KindView>();
  for (const widget of DEMO_WIDGETS) {
    const sampled = SAMPLED_KINDS.has(widget.kind) ? sampleView(widget.kind, t) : undefined;
    if (sampled) {
      views.set(widget.id, sampled);
      continue;
    }
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
            ...settingsContext(widget.kind, widget),
          })
    );
  }
  return views;
}
