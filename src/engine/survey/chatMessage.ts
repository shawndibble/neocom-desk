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
}

/**
 * The frame: an open box. The ETA is set into the top rail and the link into the
 * bottom one, each centred; the bar and the ore line sit beside a `║` rail on the
 * left. Nothing closes the right side: chat draws a proportional font, so a right
 * edge never lined up. Each rail tapers off (`╌┄┈`) instead.
 *
 * A rail is never shorter than the content under it, and at most a character
 * longer: it is as long as the ore line, or as the link's rail when that is
 * longer, rounded up to a whole `─`. The bar rounds the other way, so it never
 * outruns the rails. Lengths are measured in pixels with the widths in
 * `chatFont.ts` (an `i` is 4px, an `m` 10px), not counted in characters.
 */
const SIDE = '│ ';
const SIDE_PX = textWidth(SIDE);
const RAIL_CHAR = '─';
const RAIL_PX = textWidth(RAIL_CHAR);
const BLOCK_PX = textWidth('█');
const SPACE_PX = textWidth(' ');
const TAPER = '╌┄┈';
/** A rail without its fill or label: the corner, the label's brackets with a space inside each, the taper. */
const RAIL_FRAME_PX = textWidth('┌[  ]' + TAPER);
/** Fewest cells the bar may shrink to. */
const MIN_BAR_CELLS = 10;

/** How many `unit`-wide characters cover `gap` px, rounded by `round`; never negative. */
const unitsFor = (gap: number, unit: number, round: (n: number) => number): number =>
  Math.max(0, round(gap / unit));

/** `┌───[ label ]───╌┄┈`, at least `width` px long and under a character more, label centred. */
function rail(corner: string, label: string, width: number): string {
  const fill = unitsFor(width - RAIL_FRAME_PX - textWidth(label), RAIL_PX, Math.ceil);
  const before = Math.floor(fill / 2);
  return `${corner}${RAIL_CHAR.repeat(before)}[ ${label} ]${RAIL_CHAR.repeat(fill - before)}${TAPER}`;
}

/**
 * The bar row: the bar fills the box's width once the percent after it has its
 * room. No end caps: they indent the bar and read thin next to the blocks.
 */
function barRow(percent: number, finished: boolean, width: number): string {
  const tail = `${percent}%`;
  const cells = Math.max(
    unitsFor(width - SIDE_PX - SPACE_PX - textWidth(tail), BLOCK_PX, Math.floor),
    MIN_BAR_CELLS
  );
  const filled = finished ? cells : Math.floor((percent * cells) / 100);
  return `${SIDE}${'█'.repeat(filled)}${'░'.repeat(cells - filled)} ${tail}`;
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

/**
 * Quality prefixes that can come off an ore name. A first word not listed
 * here is part of the name ("Dark Ochre", "Clear Icicle", "Glacial Mass"), so
 * an unknown prefix only costs width, never a wrong name.
 */
const QUALITY_PREFIXES = new Set([
  'Concentrated',
  'Dense',
  'Condensed',
  'Massive',
  'Solid',
  'Viscous',
  'Azure',
  'Rich',
  'Silvery',
  'Golden',
  'Luminous',
  'Fiery',
  'Pure',
  'Pristine',
  'Vivid',
  'Radiant',
  'Vitric',
  'Glazed',
  'Bright',
  'Gleaming',
  'Sharp',
  'Crystalline',
  'Onyx',
  'Obsidian',
  'Iridescent',
  'Prismatic',
  'Triclinic',
  'Monoclinic',
  'Crimson',
  'Prime',
  'Magma',
  'Vitreous',
  'Brimful',
  'Glistening',
  'Copious',
  'Twinkling',
  'Lavish',
  'Shimmering',
  'Bountiful',
  'Shiny',
  'Replete',
  'Glowing',
  'Sparkling',
  'Brilliant',
  'Enriched',
  'Thick',
  'Smooth',
]);

/** Newer ore names carry the grade last: "Scordite II-Grade". */
const GRADED = /\s(?:I|II|III|IV|V)-Grade$/;

/**
 * Short names for a set of ore names: the quality prefix goes ("Glistening
 * Sylvite" -> "Sylvite") unless that would make two ores read the same
 * ("Dense Veldspar" and "Concentrated Veldspar" keep their prefixes).
 */
export function shortOreNames(names: readonly string[]): Record<string, string> {
  const base = (name: string): string => {
    // "Pyroxeres II-Grade": the grade is a suffix and part of what the ore is.
    if (GRADED.test(name)) return name.replace(/-Grade$/, '');
    const words = name.split(' ');
    return words.length > 1 && QUALITY_PREFIXES.has(words[0]) ? words.slice(1).join(' ') : name;
  };
  const unique = [...new Set(names)];
  const counts = new Map<string, number>();
  for (const name of unique) counts.set(base(name), (counts.get(base(name)) ?? 0) + 1);
  return Object.fromEntries(
    unique.map((name) => [name, counts.get(base(name)) === 1 ? base(name) : name])
  );
}

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

/** How many ores the "Left:" line names before grouping the rest. */
const MAX_NAMED_ORES = 2;

/**
 * "Left: 5 Scordite · 4 Kernite · 35 other": the two ores richest per m³ left
 * (the order the page lists them in), each with its rock count, and the rocks
 * of every other ore grouped into one count. `ores` arrives richest first, and
 * fewer than two are named if a longer line would wrap.
 */
function oreLine(
  ores: SurveySummary['ores'],
  short: Record<string, string>,
  labels: SurveyMessageLabels
): string {
  const rocksIn = (list: SurveySummary['ores']): number => list.reduce((n, o) => n + o.rocks, 0);
  const prefixPx = SIDE_PX + textWidth(fill(labels.left, { ores: '' }));
  const listed: string[] = [];
  let named = 0;
  for (const ore of ores.slice(0, MAX_NAMED_ORES)) {
    const entry = `${ore.rocks} ${short[ore.ore]}`;
    const rest = rocksIn(ores.slice(named + 1));
    const other = rest > 0 ? [fill(labels.more, { count: rest })] : [];
    const px = prefixPx + textWidth([...listed, entry, ...other].join(SEPARATOR));
    if (listed.length > 0 && px > MAX_ROW_PX) break;
    listed.push(entry);
    named++;
  }
  const other = rocksIn(ores.slice(named));
  if (other > 0) listed.push(fill(labels.more, { count: other }));
  return fill(labels.left, { ores: listed.join(SEPARATOR) });
}

/**
 * The box's rows (three for a cleared field, which has no ore line), all as long
 * as the longest of: the ore row, and each rail holding its label.
 */
function box(
  headline: string,
  percent: number,
  finished: boolean,
  ore: string | null,
  url: string
): string[] {
  const width = Math.max(
    RAIL_FRAME_PX + textWidth(headline),
    RAIL_FRAME_PX + textWidth(url),
    SIDE_PX + SPACE_PX + textWidth(`${percent}%`) + MIN_BAR_CELLS * BLOCK_PX,
    ore === null ? 0 : SIDE_PX + textWidth(ore)
  );
  return [
    rail('┌', headline, width),
    barRow(percent, finished, width),
    ...(ore === null ? [] : [SIDE + ore]),
    rail('└', url, width),
  ];
}

export function surveyChatMessage(
  summary: SurveySummary,
  url: string,
  labels: SurveyMessageLabels
): string {
  // Chat puts the speaker's name before the first line, so a heading line takes that
  // spot and the box starts underneath it instead of beside the name.
  const lead = `${labels.heading}\n`;

  if (summary.finished) {
    const headline = fill(labels.cleared, { duration: formatDuration(summary.elapsedMs) });
    return lead + box(headline, 100, true, null, url).join('\n');
  }

  const timing =
    summary.etaAt === null
      ? labels.waiting
      : fill(labels.done, {
          time: formatEveClock(summary.etaAt),
          left: formatDuration(summary.etaAt - summary.lastAt),
        });

  // Dearest unit first, as the page lists them.
  const present = summary.ores.filter((o) => o.rocks > 0);
  const ore = oreLine(present, shortOreNames(present.map((o) => o.ore)), labels);
  return lead + box(timing, summary.percent, false, ore, url).join('\n');
}
