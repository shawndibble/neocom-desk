import type { SurveySummary } from './series';
import { formatCompactNumber } from '@/lib/compactNumber';
import { textWidth } from './chatFont';
import { MINUTE_MS } from '@/lib/age';

export interface SurveyMessageLabels {
  heading: string;
  done: string;
  waiting: string;
  left: string;
  more: string;
  cleared: string;
  location: string;
  pace: string;
  percent: string;
  value: string;
  volume: string;
  elapsed: string;
}

export type SurveyChatBorder = 'single' | 'double' | 'none';
export type SurveyChatOres = 'off' | 'top2' | 'top3' | 'all';

export interface SurveyChatOptions {
  border: SurveyChatBorder;
  eta: boolean;
  bar: boolean;
  ores: SurveyChatOres;
  rockCounts: boolean;
  location: boolean;
  pace: boolean;
  percentLeft: boolean;
  iskLeft: boolean;
  volumeLeft: boolean;
  elapsed: boolean;
}

export const DEFAULT_SURVEY_CHAT_OPTIONS: SurveyChatOptions = {
  border: 'single',
  eta: true,
  bar: true,
  ores: 'top2',
  rockCounts: true,
  location: false,
  pace: false,
  percentLeft: false,
  iskLeft: false,
  volumeLeft: false,
  elapsed: false,
};

export const SURVEY_CHAT_BORDERS: readonly SurveyChatBorder[] = ['single', 'double', 'none'];
export const SURVEY_CHAT_ORES: readonly SurveyChatOres[] = ['off', 'top2', 'top3', 'all'];

export function parseSurveyChatOptions(raw: unknown): SurveyChatOptions | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const d = DEFAULT_SURVEY_CHAT_OPTIONS;
  const flag = (key: keyof SurveyChatOptions): boolean =>
    typeof r[key] === 'boolean' ? (r[key] as boolean) : (d[key] as boolean);
  return {
    border: SURVEY_CHAT_BORDERS.includes(r.border as SurveyChatBorder)
      ? (r.border as SurveyChatBorder)
      : d.border,
    ores: SURVEY_CHAT_ORES.includes(r.ores as SurveyChatOres) ? (r.ores as SurveyChatOres) : d.ores,
    eta: flag('eta'),
    bar: flag('bar'),
    rockCounts: flag('rockCounts'),
    location: flag('location'),
    pace: flag('pace'),
    percentLeft: flag('percentLeft'),
    iskLeft: flag('iskLeft'),
    volumeLeft: flag('volumeLeft'),
    elapsed: flag('elapsed'),
  };
}

interface Frame {
  top: string;
  bottom: string;
  rail: string;
  side: string;
  rails: boolean;
}

const FRAMES: Record<SurveyChatBorder, Frame> = {
  single: { top: '┌', bottom: '└', rail: '─', side: '│ ', rails: true },
  double: { top: '╔', bottom: '╚', rail: '═', side: '║ ', rails: true },
  none: { top: '', bottom: '', rail: '', side: '', rails: false },
};
const BLOCK_PX = textWidth('█');
const TAPER = '╌┄┈';
const MIN_BAR_CELLS = 10;

const unitsFor = (gap: number, unit: number, round: (n: number) => number): number =>
  Math.max(0, round(gap / unit));

const bracketed = (label: string): string => (label === '' ? '' : `[ ${label} ]`);

const railChromePx = (frame: Frame, corner: string, label: string): number =>
  frame.rails ? textWidth(corner + bracketed(label)) - textWidth(label) + textWidth(TAPER) : 0;

function rail(frame: Frame, corner: string, label: string, width: number): string {
  const fill = unitsFor(
    width - railChromePx(frame, corner, label) - textWidth(label),
    textWidth(frame.rail),
    Math.ceil
  );
  const before = Math.floor(fill / 2);
  return `${corner}${frame.rail.repeat(before)}${bracketed(label)}${frame.rail.repeat(fill - before)}${TAPER}`;
}

function barRow(frame: Frame, percent: number, finished: boolean, width: number): string {
  const cells = Math.max(
    unitsFor(width - textWidth(frame.side), BLOCK_PX, Math.floor),
    MIN_BAR_CELLS
  );
  const filled = finished ? cells : Math.floor((percent * cells) / 100);
  return `${frame.side}${'█'.repeat(filled)}${'░'.repeat(cells - filled)}`;
}

export const MAX_ROW_PX = 300;
const SEPARATOR = ' · ';

const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));

export function formatEveClock(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE_MS));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const NAMED_ORES = { top2: 2, top3: 3 } as const;

function oreItems(
  ores: SurveyChatSummaryOres,
  labels: SurveyMessageLabels,
  options: SurveyChatOptions,
  sidePx: number
): string[] {
  const rocksIn = (list: SurveyChatSummaryOres): number => list.reduce((n, o) => n + o.rocks, 0);
  const entryFor = (ore: SurveyChatSummaryOres[number]): string =>
    options.rockCounts ? `${ore.rocks} ${ore.ore}` : ore.ore;
  if (options.ores === 'all') return ores.map(entryFor);

  const prefixPx = sidePx + textWidth(fill(labels.left, { ores: '' }));
  const limit = NAMED_ORES[options.ores as 'top2' | 'top3'];
  const listed: string[] = [];
  let named = 0;
  for (const ore of ores.slice(0, limit)) {
    const entry = entryFor(ore);
    const rest = rocksIn(ores.slice(named + 1));
    const other = rest > 0 ? [fill(labels.more, { count: rest })] : [];
    const px = prefixPx + textWidth([...listed, entry, ...other].join(SEPARATOR));
    if (listed.length > 0 && px > MAX_ROW_PX) break;
    listed.push(entry);
    named++;
  }
  const other = rocksIn(ores.slice(named));
  if (other > 0) listed.push(fill(labels.more, { count: other }));
  return listed;
}

type SurveyChatSummaryOres = SurveySummary['ores'];

interface BoxContent {
  headline: string;
  bar: { percent: number; finished: boolean } | null;
  rows: string[];
  url: string;
}

function box(frame: Frame, { headline, bar, rows, url }: BoxContent): string[] {
  const side = textWidth(frame.side);
  const width = Math.max(
    railChromePx(frame, frame.top, headline) + textWidth(headline),
    railChromePx(frame, frame.top, url) + textWidth(url),
    bar === null ? 0 : side + MIN_BAR_CELLS * BLOCK_PX,
    ...rows.map((r) => side + textWidth(r))
  );
  const top = frame.rails ? rail(frame, frame.top, headline, width) : headline;
  return [
    ...(top === '' ? [] : [top]),
    ...(bar === null ? [] : [barRow(frame, bar.percent, bar.finished, width)]),
    ...rows.map((r) => frame.side + r),
    frame.rails ? rail(frame, frame.bottom, url, width) : url,
  ];
}

function packRows(items: readonly string[], sidePx: number, firstPrefixPx = 0): string[] {
  const rows: string[] = [];
  for (const item of items) {
    const last = rows.length - 1;
    const joined = last >= 0 ? `${rows[last]}${SEPARATOR}${item}` : item;
    const prefix = last === 0 ? firstPrefixPx : 0;
    if (last >= 0 && sidePx + prefix + textWidth(joined) <= MAX_ROW_PX) rows[last] = joined;
    else rows.push(item);
  }
  return rows;
}

export function surveyChatMessage(
  summary: SurveySummary,
  url: string,
  labels: SurveyMessageLabels,
  now: number = summary.lastAt,
  options: SurveyChatOptions = DEFAULT_SURVEY_CHAT_OPTIONS,
  location: string | null = null
): string {
  const lead = `${labels.heading}\n`;
  const frame = FRAMES[options.border];
  const place =
    options.location && location !== null && location !== ''
      ? fill(labels.location, { place: location })
      : null;
  const placeRows = place === null ? [] : [place];

  if (summary.finished) {
    const headline = fill(labels.cleared, { duration: formatDuration(summary.elapsedMs) });
    const bar = options.bar ? { percent: 100, finished: true } : null;
    return lead + box(frame, { headline, bar, rows: placeRows, url }).join('\n');
  }

  const timing =
    summary.etaAt === null
      ? labels.waiting
      : fill(labels.done, {
          time: formatEveClock(summary.etaAt),
          left: formatDuration(Math.max(0, summary.etaAt - now)),
        });

  const present = summary.ores.filter((o) => o.rocks > 0);
  const num = (n: number): string => Math.round(n).toLocaleString('en-US');
  const sidePx = textWidth(frame.side);
  const leftItems = [
    ...(options.percentLeft
      ? [fill(labels.percent, { percent: Math.max(0, 100 - summary.percent) })]
      : []),
    ...(options.ores === 'off' ? [] : oreItems(present, labels, options, sidePx)),
    ...(options.iskLeft && summary.iskLeft !== null
      ? [fill(labels.value, { isk: formatCompactNumber(summary.iskLeft) })]
      : []),
    ...(options.volumeLeft ? [fill(labels.volume, { left: num(summary.leftVolume) })] : []),
  ];
  const leftRows = packRows(leftItems, sidePx, textWidth(fill(labels.left, { ores: '' }))).map(
    (row, i) => (i === 0 ? fill(labels.left, { ores: row }) : row)
  );
  const stats = [
    ...(options.pace && summary.pace !== null
      ? [fill(labels.pace, { pace: num(summary.pace) })]
      : []),
    ...(options.elapsed && summary.elapsedMs > 0
      ? [fill(labels.elapsed, { duration: formatDuration(summary.elapsedMs) })]
      : []),
  ];
  const etaRows = options.eta && place !== null ? [timing] : [];
  return (
    lead +
    box(frame, {
      headline: place ?? (options.eta ? timing : ''),
      bar:
        options.bar && summary.points.length > 1
          ? { percent: summary.percent, finished: false }
          : null,
      rows: [...leftRows, ...etaRows, ...packRows(stats, sidePx)],
      url,
    }).join('\n')
  );
}
