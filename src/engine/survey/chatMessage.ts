/**
 * The message the Survey tab's "Copy chat message" button puts on the
 * clipboard, for pasting into an in-game channel.
 *
 * In-game chat drops colour, size, hint and link tags, and the message leaves
 * out bold (its glyph widths were not measured), so the style is words and
 * box and block characters. Wording comes in as `labels` (this engine imports
 * no i18n); a label's `{placeholders}` are filled here.
 */
import type { SurveySummary } from './series';
import { formatCompactNumber } from '@/lib/compactNumber';
import { textWidth } from './chatFont';

export interface SurveyMessageLabels {
  /** The first line, before the box: chat puts the speaker's name beside it. */
  heading: string;
  /** `{time}` is HH:MM EVE time, `{left}` the time remaining. */
  done: string;
  waiting: string;
  /** `{ores}` is the joined ore list. */
  left: string;
  /** `{count}` rocks of the ores not named. */
  more: string;
  /** `{duration}` is the whole mining time. */
  cleared: string;
  /** `{place}` is the survey's location. */
  location: string;
  /** `{pace}` is m³ mined per second. */
  pace: string;
  /** `{isk}` is the compact ISK value of what is left. */
  value: string;
  /** `{left}` and `{total}` are m³ left and m³ the scans have shown. */
  volume: string;
  /** `{duration}` is the mining time so far. */
  elapsed: string;
}

export type SurveyChatBorder = 'single' | 'double' | 'none';
export type SurveyChatOres = 'off' | 'top2' | 'top3' | 'all';

/** What the pilot chose to put in the message. The heading and the link row are never optional. */
export interface SurveyChatOptions {
  border: SurveyChatBorder;
  /** The ETA in the top rail; off leaves the rail bare. A cleared field always says so. */
  eta: boolean;
  /** The progress bar. A survey with a single scan has nothing to show, so it never gets one. */
  bar: boolean;
  ores: SurveyChatOres;
  /** Rock counts before the ore names. */
  rockCounts: boolean;
  location: boolean;
  pace: boolean;
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
  iskLeft: false,
  volumeLeft: false,
  elapsed: false,
};

export const SURVEY_CHAT_BORDERS: readonly SurveyChatBorder[] = ['single', 'double', 'none'];
export const SURVEY_CHAT_ORES: readonly SurveyChatOres[] = ['off', 'top2', 'top3', 'all'];

/** A stored value read back: unknown or missing fields fall to the default, so an old save survives a new option. */
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
    iskLeft: flag('iskLeft'),
    volumeLeft: flag('volumeLeft'),
    elapsed: flag('elapsed'),
  };
}

/**
 * How a border draws the box. The box is open: nothing closes the right side,
 * because chat draws a proportional font and a right edge never lined up. Each
 * rail tapers off (`╌┄┈`) instead.
 */
interface Frame {
  /** The corner that opens the top rail, and the one that opens the bottom rail. */
  top: string;
  bottom: string;
  /** The character a rail is filled with. */
  rail: string;
  /** What a row starts with, beside the rail. */
  side: string;
}

const FRAMES: Record<SurveyChatBorder, Frame> = {
  single: { top: '┌', bottom: '└', rail: '─', side: '│ ' },
  double: { top: '╔', bottom: '╚', rail: '═', side: '║ ' },
  // No side to hang a corner on: bare rails over the rows.
  none: { top: '', bottom: '', rail: '─', side: '' },
};
const BLOCK_PX = textWidth('█');
const SPACE_PX = textWidth(' ');
const TAPER = '╌┄┈';
/** Fewest cells the bar may shrink to. */
const MIN_BAR_CELLS = 10;

/** How many `unit`-wide characters cover `gap` px, rounded by `round`; never negative. */
const unitsFor = (gap: number, unit: number, round: (n: number) => number): number =>
  Math.max(0, round(gap / unit));

/** The brackets a rail sets its label in, with a space inside each; a bare rail has none. */
const bracketed = (label: string): string => (label === '' ? '' : `[ ${label} ]`);

/** A rail's fixed parts in px: the corner, the label's brackets and spaces (none when bare), the taper. */
const railChromePx = (corner: string, label: string): number =>
  textWidth(corner + bracketed(label)) - textWidth(label) + textWidth(TAPER);

/**
 * `┌───[ label ]───╌┄┈`, label centred, at least `width` px long and under a
 * character more: the rail rounds up to a whole rail character, where the bar
 * rounds down, so the bar never outruns the rails. A bare rail has no label.
 */
function rail(frame: Frame, corner: string, label: string, width: number): string {
  const fill = unitsFor(
    width - railChromePx(corner, label) - textWidth(label),
    textWidth(frame.rail),
    Math.ceil
  );
  const before = Math.floor(fill / 2);
  return `${corner}${frame.rail.repeat(before)}${bracketed(label)}${frame.rail.repeat(fill - before)}${TAPER}`;
}

/**
 * The bar row: the bar fills the box's width once the percent after it has its
 * room. No end caps: they indent the bar and read thin next to the blocks.
 */
function barRow(frame: Frame, percent: number, finished: boolean, width: number): string {
  const tail = `${percent}%`;
  const cells = Math.max(
    unitsFor(width - textWidth(frame.side) - SPACE_PX - textWidth(tail), BLOCK_PX, Math.floor),
    MIN_BAR_CELLS
  );
  const filled = finished ? cells : Math.floor((percent * cells) / 100);
  return `${frame.side}${'█'.repeat(filled)}${'░'.repeat(cells - filled)} ${tail}`;
}

/**
 * Widest a row of the message may run, in pixels, so it does not wrap in a
 * default-width chat window. Measured in game: rows of 267-274px fit, and a row
 * of 367px wrapped; the window holds about 335px, so this leaves room to spare.
 * It limits what the ore line may name; a long link can still lengthen the rails
 * past it.
 */
export const MAX_ROW_PX = 300;
const SEPARATOR = ' · ';

const fill = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));

export function formatEveClock(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "14m" or "2h 10m", rounded to the minute and never under 1m. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const NAMED_ORES = { top2: 2, top3: 3 } as const;

/**
 * "Left: 5 Scordite · 4 Kernite · 35 other": the dearest ores by unit price (the
 * order the page lists them in), each with its rock count, and the rocks of
 * every other ore grouped into one count. `ores` arrives dearest first, and
 * fewer are named if a longer line would wrap. `all` names every ore instead,
 * over as many rows as the width needs.
 */
function oreRows(
  ores: SurveyChatSummaryOres,
  labels: SurveyMessageLabels,
  options: SurveyChatOptions,
  sidePx: number
): string[] {
  const rocksIn = (list: SurveyChatSummaryOres): number => list.reduce((n, o) => n + o.rocks, 0);
  const entryFor = (ore: SurveyChatSummaryOres[number]): string =>
    options.rockCounts ? `${ore.rocks} ${ore.ore}` : ore.ore;
  const prefixPx = sidePx + textWidth(fill(labels.left, { ores: '' }));

  if (options.ores === 'all') {
    const rows: string[] = [];
    let row: string[] = [];
    for (const ore of ores) {
      const next = [...row, entryFor(ore)].join(SEPARATOR);
      if (
        row.length > 0 &&
        (rows.length === 0 ? prefixPx : sidePx) + textWidth(next) > MAX_ROW_PX
      ) {
        rows.push(row.join(SEPARATOR));
        row = [];
      }
      row.push(entryFor(ore));
    }
    if (row.length > 0) rows.push(row.join(SEPARATOR));
    return rows.map((r, i) => (i === 0 ? fill(labels.left, { ores: r }) : r));
  }

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
  return [fill(labels.left, { ores: listed.join(SEPARATOR) })];
}

type SurveyChatSummaryOres = SurveySummary['ores'];

interface BoxContent {
  /** The top rail's label; '' leaves it bare. */
  headline: string;
  bar: { percent: number; finished: boolean } | null;
  rows: string[];
  url: string;
}

/**
 * The box's rows, all as long as the longest of: the content rows, the bar's
 * least width, and each rail holding its label.
 */
function box(frame: Frame, { headline, bar, rows, url }: BoxContent): string[] {
  const side = textWidth(frame.side);
  const width = Math.max(
    railChromePx(frame.top, headline) + textWidth(headline),
    railChromePx(frame.top, url) + textWidth(url),
    bar === null ? 0 : side + SPACE_PX + textWidth(`${bar.percent}%`) + MIN_BAR_CELLS * BLOCK_PX,
    ...rows.map((r) => side + textWidth(r))
  );
  return [
    rail(frame, frame.top, headline, width),
    ...(bar === null ? [] : [barRow(frame, bar.percent, bar.finished, width)]),
    ...rows.map((r) => frame.side + r),
    rail(frame, frame.bottom, url, width),
  ];
}

export function surveyChatMessage(
  summary: SurveySummary,
  url: string,
  labels: SurveyMessageLabels,
  // The time "left" counts from here: the same clock the page shows, so a copy matches the screen.
  now: number = summary.lastAt,
  options: SurveyChatOptions = DEFAULT_SURVEY_CHAT_OPTIONS,
  /** The survey's location, when it has one; shown only if the options ask. */
  location: string | null = null
): string {
  // Chat puts the speaker's name before the first line, so a heading line takes that
  // spot and the box starts underneath it instead of beside the name.
  const lead = `${labels.heading}\n`;
  const frame = FRAMES[options.border];
  const placeRows =
    options.location && location !== null && location !== ''
      ? [fill(labels.location, { place: location })]
      : [];

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

  // Dearest unit first, as the page lists them.
  const present = summary.ores.filter((o) => o.rocks > 0);
  const oresRows =
    options.ores === 'off' ? [] : oreRows(present, labels, options, textWidth(frame.side));
  const num = (n: number): string => Math.round(n).toLocaleString('en-US');
  const extras = [
    ...(options.pace && summary.pace !== null
      ? [fill(labels.pace, { pace: num(summary.pace) })]
      : []),
    ...(options.iskLeft && summary.iskLeft !== null
      ? [fill(labels.value, { isk: formatCompactNumber(summary.iskLeft) })]
      : []),
    ...(options.volumeLeft
      ? [
          fill(labels.volume, {
            left: num(summary.leftVolume),
            total: num(summary.startVolume),
          }),
        ]
      : []),
    ...(options.elapsed && summary.elapsedMs > 0
      ? [fill(labels.elapsed, { duration: formatDuration(summary.elapsedMs) })]
      : []),
  ];
  return (
    lead +
    box(frame, {
      headline: options.eta ? timing : '',
      // One scan: nothing mined yet, so a bar would only say 0%.
      bar:
        options.bar && summary.points.length > 1
          ? { percent: summary.percent, finished: false }
          : null,
      rows: [...placeRows, ...oresRows, ...extras],
      url,
    }).join('\n')
  );
}
