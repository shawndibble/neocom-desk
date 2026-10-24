/**
 * Corp people and mining builders: Members, Inactive members and Moon mining
 * ledger. Same contract as `models.ts`: pure, derived at render time.
 */
import { shiftUtcDate, utcDay } from '@/engine/localDay';
import { label, memberStanding, type MemberActivity } from '@/engine/corp/members';
import { DAY_MS } from '@/lib/age';
import { formatNumber } from '@/lib/numberLocale';
import { ageText, blank, corpUnreadable, count, statusOf, type Builder } from './builderKit';
import { fractionBar } from './cellKit';
import { hbarsFromRows } from './chartBuilders';
import type { BarsChartModel } from '../charts/types';
import type { TableModel, Translate } from './types';

const M = 'overview.widgets.corpMembers';
const I = 'overview.widgets.corpInactive';
const G = 'overview.widgets.corpMining';

const MEMBERS_PATH = '/corp/members';
/** The roster's own dark-only filter (`CorpMembers` reads `?dark=1`), so the link lands on the same set. */
const INACTIVE_PATH = `${MEMBERS_PATH}?dark=1`;
const MOONS_PATH = '/corp/moons';

/** ESI keeps about this many days of an observer ledger. */
const LEDGER_DAYS = 30;
const CHART_MONTHS = 12;
const TOP_MINERS = 8;

/** A name ESI could not resolve prints the way the roster prints it. */
const nameOf = (names: ReadonlyMap<number, string>, id: number) => label(names.get(id) ?? null, id);

// --- Members -----------------------------------------------------------------------

/** Members by the UTC month they joined, oldest first, for the last `CHART_MONTHS` months. */
function joinsByMonth(members: readonly MemberActivity[], now: number): number[] {
  const at = new Date(now);
  const base = at.getUTCFullYear() * 12 + at.getUTCMonth();
  const buckets = new Array<number>(CHART_MONTHS).fill(0);
  for (const member of members) {
    if (member.startMs === null) continue;
    const joined = new Date(member.startMs);
    const age = base - (joined.getUTCFullYear() * 12 + joined.getUTCMonth());
    if (age >= 0 && age < CHART_MONTHS) buckets[CHART_MONTHS - 1 - age]! += 1;
  }
  return buckets;
}

function monthTitle(now: number, monthsAgo: number): string {
  const at = new Date(now);
  const month = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() - monthsAgo, 1));
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(month);
}

function joinsChart(t: Translate, members: readonly MemberActivity[], now: number) {
  const values = joinsByMonth(members, now);
  const tallest = Math.max(...values);
  if (tallest <= 0) return undefined;
  const titles = values.map((_, i) => monthTitle(now, CHART_MONTHS - 1 - i));
  const chart: BarsChartModel = {
    kind: 'bars',
    values,
    max: t(`${M}.chart.max`, { value: formatNumber(tallest) }),
    xStart: t(`${M}.chart.monthsAgo`, { count: CHART_MONTHS - 1 }),
    xEnd: t(`${M}.chart.thisMonth`),
    tips: values.map((value, i) => ({
      title: titles[i]!,
      rows: [{ label: t(`${M}.chart.joined`), value: formatNumber(value) }],
    })),
    note: t(`${M}.chart.note`),
    summary: t(`${M}.chart.summary`, {
      count: values.reduce((sum, v) => sum + v, 0),
      months: CHART_MONTHS,
      items: values.map((value, i) => `${titles[i]} ${value}`).join(', '),
    }),
  };
  return chart;
}

export const corpMembers: Builder = (feeds, { t, now }) => {
  const feed = feeds.corpMembers;
  const data = feed?.data ?? null;
  const to = MEMBERS_PATH;
  if (!data) return blank(to, statusOf(feed));
  if (!data.readable) return corpUnreadable(to, feed, data.needsReauth, t);

  const { members, diff, names } = data;
  const changed = diff !== null && (diff.joined.length > 0 || diff.left.length > 0);
  const changeText =
    diff !== null && changed
      ? t(`${M}.secondary`, { joined: diff.joined.length, left: diff.left.length })
      : undefined;

  const rows =
    diff === null
      ? []
      : [
          ...diff.joined.map((id) => ({
            key: `joined:${id}`,
            cells: [nameOf(names, id), { text: t(`${M}.joined`), tone: 'good' as const }],
          })),
          ...diff.left.map((id) => ({
            key: `left:${id}`,
            cells: [nameOf(names, id), { text: t(`${M}.left`), tone: 'caution' as const }],
          })),
        ];
  const table: TableModel = {
    columns: [
      { key: 'member', label: t(`${M}.col.member`), priority: 0 },
      { key: 'change', label: t(`${M}.col.change`), priority: 1 },
    ],
    rows,
    footer: diff === null ? t(`${M}.unknownDiff`) : changed ? undefined : t(`${M}.noChange`),
  };

  return {
    ...blank(to, statusOf(feed, { isEmpty: members.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: count(members.length),
      unit: t(`${M}.unit`, { count: members.length }),
      secondary: changeText ? { text: changeText } : undefined,
      tone: 'clear',
    },
    table,
    chart: joinsChart(t, members, now),
    summary: [
      t(`${M}.summary`, { count: members.length }),
      changeText,
      diff === null ? t(`${M}.unknownDiff`) : undefined,
    ]
      .filter(Boolean)
      .join(' '),
  };
};

// --- Inactive members --------------------------------------------------------------

export const corpInactive: Builder = (feeds, { t }) => {
  const feed = feeds.corpMembers;
  const data = feed?.data ?? null;
  const to = INACTIVE_PATH;
  if (!data) return blank(to, statusOf(feed));
  if (!data.readable) return corpUnreadable(to, feed, data.needsReauth, t);

  const { names, darkAfterDays, loadedAt } = data;
  // The roster's own rule: later of logon/logoff, or the join date for a member who never played.
  const inactive = data.members
    .map((member) => ({ member, standing: memberStanding(member, loadedAt, darkAfterDays) }))
    .filter((entry) => entry.standing.isDark)
    .sort(
      (a, b) =>
        (b.standing.darkForMs ?? 0) - (a.standing.darkForMs ?? 0) ||
        a.member.characterId - b.member.characterId
    );

  const table: TableModel = {
    columns: [
      { key: 'member', label: t(`${I}.col.member`), priority: 0 },
      { key: 'lastSeen', label: t(`${I}.col.lastSeen`), align: 'end', priority: 1 },
    ],
    rows: inactive.map(({ member, standing }) => ({
      key: String(member.characterId),
      cells: [
        nameOf(names, member.characterId),
        standing.neverSeen ? t('corp.members.never') : ageText(t, loadedAt, standing.lastSeenMs),
      ],
    })),
    pageable: true,
  };
  const threshold = t(`${I}.threshold`, { days: darkAfterDays });

  return {
    ...blank(to, statusOf(feed, { isEmpty: inactive.length === 0 })),
    emptyHealthy: true,
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: count(inactive.length),
      unit: t(`${I}.unit`, { count: inactive.length }),
      secondary: { text: threshold },
      tone: inactive.length > 0 ? 'warning' : 'clear',
    },
    table,
    summary: t(`${I}.summary`, { count: inactive.length, days: darkAfterDays }),
  };
};

// --- Moon mining ledger ------------------------------------------------------------

interface MinerTotal {
  id: number;
  units: number;
  ores: Map<number, number>;
}

function topOre(miner: MinerTotal): number {
  let best = -1;
  let bestUnits = -1;
  for (const [typeId, units] of miner.ores) {
    if (units > bestUnits || (units === bestUnits && typeId < best)) {
      best = typeId;
      bestUnits = units;
    }
  }
  return best;
}

function percentText(t: Translate, share: number): string {
  const pct = Math.round(share * 100);
  return pct < 1 ? t(`${G}.underOne`) : t(`${G}.percent`, { value: pct });
}

export const corpMining: Builder = (feeds, { t, now, range }) => {
  const feed = feeds.corpMining;
  const data = feed?.data ?? null;
  const to = MOONS_PATH;
  if (!data) return blank(to, statusOf(feed));
  if (!data.readable) return corpUnreadable(to, feed, data.needsReauth, t);
  if (data.refineryCount === 0) {
    return {
      ...blank(to, statusOf(feed, { isEmpty: true })),
      fetchedAt: data.fetchedAt,
      fromCache: data.fromCache,
      emptyMessage: t(`${G}.noRefineries`),
      summary: t(`${G}.noRefineries`),
    };
  }

  const today = utcDay(now);
  const start = shiftUtcDate(today, -(range - 1));
  const inRange = data.rows.filter((row) => row.date >= start && row.date <= today);

  const byMiner = new Map<number, MinerTotal>();
  let total = 0;
  for (const row of inRange) {
    const miner = byMiner.get(row.characterId) ?? {
      id: row.characterId,
      units: 0,
      ores: new Map<number, number>(),
    };
    miner.units += row.quantity;
    miner.ores.set(row.typeId, (miner.ores.get(row.typeId) ?? 0) + row.quantity);
    byMiner.set(row.characterId, miner);
    total += row.quantity;
  }
  const miners = [...byMiner.values()].sort((a, b) => b.units - a.units || a.id - b.id);
  const oreName = (typeId: number) => data.typeNames.get(typeId) ?? `#${typeId}`;
  const minerName = (id: number) => nameOf(data.minerNames, id);

  const oldest = data.rows.reduce<string | null>(
    (min, row) => (min === null || row.date < min ? row.date : min),
    null
  );
  // ESI's ledger is about a month deep: a longer range must say how much it really covers.
  const covered =
    range > LEDGER_DAYS
      ? Math.min(
          range,
          oldest === null
            ? LEDGER_DAYS
            : Math.max(1, Math.round((Date.parse(today) - Date.parse(oldest)) / DAY_MS) + 1)
        )
      : null;
  const coverage =
    covered !== null && covered < range ? t(`${G}.covered`, { count: range, covered }) : undefined;
  const footer =
    [coverage, data.truncated ? t(`${G}.truncated`) : undefined].filter(Boolean).join(' ') ||
    undefined;

  const table: TableModel = {
    columns: [
      { key: 'miner', label: t(`${G}.col.miner`), priority: 0 },
      { key: 'units', label: t(`${G}.col.units`), align: 'end', priority: 1 },
      { key: 'share', label: t(`${G}.col.share`), align: 'end', priority: 2 },
      { key: 'ore', label: t(`${G}.col.ore`), priority: 3 },
    ],
    rows: miners.map((miner) => {
      const share = total > 0 ? miner.units / total : 0;
      const text = percentText(t, share);
      const bar = fractionBar(miner.units, total);
      return {
        key: String(miner.id),
        cells: [
          minerName(miner.id),
          formatNumber(miner.units),
          bar === undefined ? text : { text, bar },
          oreName(topOre(miner)),
        ],
      };
    }),
    pageable: true,
    footer,
  };

  const top = miners[0];
  const topShare = top && total > 0 ? top.units / total : 0;
  return {
    ...blank(to, statusOf(feed, { isEmpty: miners.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: formatNumber(total),
      unit: t(`${G}.unit`),
      secondary: top
        ? {
            text: t(`${G}.topMiner`, {
              name: minerName(top.id),
              share: percentText(t, topShare),
            }),
          }
        : undefined,
      notes: footer ? [footer] : undefined,
      tone: 'clear',
    },
    table,
    chart:
      hbarsFromRows(
        t,
        miners.slice(0, TOP_MINERS).map((miner) => ({
          key: String(miner.id),
          label: minerName(miner.id),
          value: miner.units,
          text: percentText(t, total > 0 ? miner.units / total : 0),
          share: total > 0 ? miner.units / total : 0,
        })),
        t(`${G}.chart.note`, { count: range })
      ) ?? undefined,
    summary: t(`${G}.summary`, { units: formatNumber(total), count: miners.length, days: range }),
  };
};
