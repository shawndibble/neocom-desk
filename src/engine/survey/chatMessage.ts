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
import { sortByValuePerM3 } from './valueTier';

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
 * The frame: a closed box. The ETA is set into the top rail and the link into
 * the bottom one, each centred; the bar and the ore line sit between `║` rails.
 *
 * Chat draws a proportional font (an `i` is 4px, an `m` 10px), so the rows are
 * padded to one pixel width using the measured character widths in
 * `chatFont.ts`, not to one character count. Padding comes in steps (a `═` or
 * `█` is 8px, a space 7px), so a row can end a pixel or two short of the box;
 * the width picked is the one where the worst row is closest.
 */
const SIDE_LEFT = '║ ';
const SIDE_RIGHT = ' ║';
const SIDE_PX = textWidth(SIDE_LEFT + SIDE_RIGHT);
const RAIL_CHAR = '═';
const RAIL_PX = textWidth(RAIL_CHAR);
const BLOCK_PX = textWidth('█');
const SPACE_PX = textWidth(' ');
/** A rail without its fill or label: two corners, two brackets, a space inside each bracket. */
const RAIL_FRAME_PX = textWidth('╔[  ]╗');
/** Fewest cells the bar may shrink to. */
const MIN_BAR_CELLS = 10;
/** Spaces a row may borrow from its fill to land closer to the box width; more would read as gaps. */
const MAX_EXTRA_SPACES = 1;

interface GapFit {
  units: number;
  spaces: number;
  error: number;
}

/** Cover `gap` px with `unit`-wide characters and a few spaces, as closely as the pixel steps allow. */
function fitGap(gap: number, unit: number): GapFit {
  let best: GapFit = { units: 0, spaces: 0, error: Infinity };
  for (let spaces = 0; spaces <= MAX_EXTRA_SPACES; spaces++) {
    const rest = gap - spaces * SPACE_PX;
    if (rest < 0) break;
    const floor = Math.floor(rest / unit);
    for (const units of [floor, floor + 1]) {
      const error = Math.abs(gap - units * unit - spaces * SPACE_PX);
      if (error < best.error) best = { units, spaces, error };
    }
  }
  return best;
}

/** Split a fit over a label's two sides so the label sits as near the middle as the pixels allow. */
function splitAround(fit: GapFit): [GapFit, GapFit] {
  let best: [GapFit, GapFit] = [fit, { units: 0, spaces: 0, error: 0 }];
  let bestImbalance = Infinity;
  for (let units = 0; units <= fit.units; units++) {
    for (let spaces = 0; spaces <= fit.spaces; spaces++) {
      const left = units * RAIL_PX + spaces * SPACE_PX;
      const right = (fit.units - units) * RAIL_PX + (fit.spaces - spaces) * SPACE_PX;
      if (Math.abs(left - right) < bestImbalance) {
        bestImbalance = Math.abs(left - right);
        best = [
          { units, spaces, error: 0 },
          { units: fit.units - units, spaces: fit.spaces - spaces, error: 0 },
        ];
      }
    }
  }
  return best;
}

/** `╔═══[ label ]═══╗`, `width` px wide as far as the pixel steps allow, label centred. */
function rail(corners: readonly [string, string], label: string, width: number): string {
  const fit = fitGap(width - RAIL_FRAME_PX - textWidth(label), RAIL_PX);
  const [a, b] = splitAround(fit);
  const side = (part: GapFit): string => RAIL_CHAR.repeat(part.units);
  return `${corners[0]}${side(a)}[${' '.repeat(1 + a.spaces)}${label}${' '.repeat(1 + b.spaces)}]${side(b)}${corners[1]}`;
}

/** A row between the side rails, padded with spaces toward `width`. */
function boxRow(content: string, width: number): string {
  const pad = Math.max(0, Math.round((width - SIDE_PX - textWidth(content)) / SPACE_PX));
  return `${SIDE_LEFT}${content}${' '.repeat(pad)}${SIDE_RIGHT}`;
}

/**
 * The bar row: the bar fills the box's width once the percent after it has its
 * room. No end caps: they indent the bar and read thin next to the blocks.
 */
function barRow(percent: number, finished: boolean, width: number): string {
  const tail = `${percent}%`;
  const fit = fitGap(width - SIDE_PX - SPACE_PX - textWidth(tail), BLOCK_PX);
  const cells = Math.max(fit.units, MIN_BAR_CELLS);
  const filled = finished ? cells : Math.floor((percent * cells) / 100);
  const bar = '█'.repeat(filled) + '░'.repeat(cells - filled);
  return `${SIDE_LEFT}${bar}${' '.repeat(1 + fit.spaces)}${tail}${SIDE_RIGHT}`;
}

/**
 * Widest a row of the message may run, in pixels, before a chat window may wrap
 * it. RockRadar's own message is the benchmark: its widest lines are about 52
 * box-drawing characters (8px each), and they never wrap. It limits what the
 * ore line may name; a long link can still widen the box past it.
 */
export const MAX_ROW_PX = 416;
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
 * The box's four rows (three for a cleared field, which has no ore line): the
 * narrowest width that holds them all, nudged up to the first width where the
 * worst row lands closest to it.
 */
function box(
  headline: string,
  percent: number,
  finished: boolean,
  ore: string | null,
  url: string
): string[] {
  const tail = `${percent}%`;
  const barGap = (width: number): number => width - SIDE_PX - SPACE_PX - textWidth(tail);
  const oreGap = (width: number): number => width - SIDE_PX - textWidth(ore ?? '');
  const railError = (label: string) => (width: number) =>
    fitGap(width - RAIL_FRAME_PX - textWidth(label), RAIL_PX).error;

  const errors = [
    railError(headline),
    railError(url),
    (width: number) => fitGap(barGap(width), BLOCK_PX).error,
    ...(ore === null
      ? []
      : [
          (width: number) =>
            Math.abs(oreGap(width) - SPACE_PX * Math.round(oreGap(width) / SPACE_PX)),
        ]),
  ];
  const minWidth = Math.max(
    RAIL_FRAME_PX + textWidth(headline),
    RAIL_FRAME_PX + textWidth(url),
    SIDE_PX + SPACE_PX + textWidth(tail) + MIN_BAR_CELLS * BLOCK_PX,
    ore === null ? 0 : SIDE_PX + textWidth(ore)
  );
  let width = minWidth;
  let worst = Infinity;
  for (let candidate = minWidth; candidate < minWidth + 2 * RAIL_PX; candidate++) {
    const error = Math.max(...errors.map((errorAt) => errorAt(candidate)));
    if (error < worst) {
      worst = error;
      width = candidate;
    }
  }

  return [
    rail(['╔', '╗'], headline, width),
    barRow(percent, finished, width),
    ...(ore === null ? [] : [boxRow(ore, width)]),
    rail(['╚', '╝'], url, width),
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

  // Richest per m³ first, as the page lists them; with no ISK the volume order stands.
  const present = sortByValuePerM3(summary.ores.filter((o) => o.rocks > 0));
  const ore = oreLine(present, shortOreNames(present.map((o) => o.ore)), labels);
  return lead + box(timing, summary.percent, false, ore, url).join('\n');
}
