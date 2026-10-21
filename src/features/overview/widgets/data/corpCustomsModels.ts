/**
 * Customs offices builder (issue #4611). Same contract as `models.ts`: pure,
 * derived at render time. The reinforce window is a standing daily schedule
 * (two whole hours, UTC), not a deadline, so nothing here ticks down.
 */
import type { CorporationCustomsOffice } from '@/esi/endpoints';
import { formatNumber } from '@/lib/numberLocale';
import { blank, corpUnreadable, count, statusOf, UNKNOWN, type Builder } from './builderKit';
import type { Translate } from './types';

const K = 'overview.widgets.corpCustomsOffices';

type RateKey = Extract<keyof CorporationCustomsOffice, `${string}_tax_rate`>;

/** Who each rate is for, in the order the game client lists them. */
const RATES: readonly { key: RateKey; label: string }[] = [
  { key: 'corporation_tax_rate', label: 'corporation' },
  { key: 'alliance_tax_rate', label: 'alliance' },
  { key: 'excellent_standing_tax_rate', label: 'excellent' },
  { key: 'good_standing_tax_rate', label: 'good' },
  { key: 'neutral_standing_tax_rate', label: 'neutral' },
  { key: 'bad_standing_tax_rate', label: 'bad' },
  { key: 'terrible_standing_tax_rate', label: 'terrible' },
];

/** ESI sends a fraction (0.05); at most one decimal, no trailing zero. */
function percent(rate: number): string {
  return `${formatNumber(Math.round(rate * 1000) / 10)}%`;
}

/** The rates ESI sent, "Corporation 5% · Good 8%"; a level it did not send is not allowed, so it is left out. */
function ratesOf(office: CorporationCustomsOffice, t: Translate): string {
  const parts = RATES.flatMap(({ key, label }) => {
    const rate = office[key];
    return rate === undefined ? [] : [`${t(`${K}.rate.${label}`)} ${percent(rate)}`];
  });
  return parts.length === 0 ? UNKNOWN : parts.join(' · ');
}

const hour = (value: number) => String(value).padStart(2, '0');

export const corpCustomsOffices: Builder = (feeds, { t }) => {
  const feed = feeds.corpCustoms;
  const data = feed?.data ?? null;
  if (!data) return blank(null, statusOf(feed));
  if (!data.readable) return corpUnreadable(null, feed, data.needsReauth, t);

  const nameOf = (office: CorporationCustomsOffice) =>
    (office.type_id === undefined ? undefined : data.typeNames.get(office.type_id)) ??
    t(`${K}.unknownType`);
  const systemOf = (office: CorporationCustomsOffice) =>
    data.systemNames.get(office.system_id) ?? UNKNOWN;
  const windowOf = (office: CorporationCustomsOffice) =>
    t(`${K}.window`, {
      start: hour(office.reinforce_exit_start),
      end: hour(office.reinforce_exit_end),
    });

  const offices = [...data.offices].sort(
    (a, b) => systemOf(a).localeCompare(systemOf(b)) || a.office_id - b.office_id
  );
  const systems = new Set(offices.map((office) => office.system_id)).size;

  return {
    ...blank(null, statusOf(feed, { isEmpty: offices.length === 0 })),
    fetchedAt: data.fetchedAt,
    fromCache: data.fromCache,
    number: {
      value: count(offices.length),
      unit: t(`${K}.unit`, { count: offices.length }),
      secondary: offices.length > 0 ? { text: t(`${K}.systems`, { count: systems }) } : undefined,
      tone: 'clear',
    },
    rows: offices.map((office) => ({
      key: String(office.office_id),
      title: nameOf(office),
      detail: systemOf(office),
      value: windowOf(office),
      tone: 'clear' as const,
    })),
    table: {
      columns: [
        { key: 'office', label: t(`${K}.col.office`), priority: 0 },
        { key: 'system', label: t(`${K}.col.system`), priority: 1 },
        { key: 'rates', label: t(`${K}.col.rates`), priority: 2, hideNarrow: true },
        { key: 'window', label: t(`${K}.col.window`), align: 'end', priority: 3 },
      ],
      rows: offices.map((office) => ({
        key: String(office.office_id),
        cells: [nameOf(office), systemOf(office), ratesOf(office, t), windowOf(office)],
      })),
    },
    summary: t(`${K}.summary`, { count: offices.length, systems }),
  };
};
