/**
 * The message the Survey tab's "Copy chat message" button puts on the
 * clipboard, for pasting into an in-game channel.
 *
 * In-game chat keeps `<b>` and drops colour, size, hint and link tags, so
 * the style is words and block characters. Wording comes in as `labels`
 * (this engine imports no i18n); a label's `{placeholders}` are filled here.
 */
import type { SurveySummary } from './series';
import { sortByValuePerM3 } from './valueTier';

export interface SurveyMessageLabels {
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
 * The ore line sets the box's width, unless a rail's label needs more (the link
 * usually does not outrun it by much), and the rails and bar stretch to match.
 * The chat font is proportional, so the right edge lines up by character count,
 * not pixel for pixel.
 */
const RAIL_LEFT = '║ ';
const RAIL_RIGHT = ' ║';
/** Fewest cells the bar may shrink to. */
const MIN_BAR_CELLS = 10;

/** Width of a line as it shows in chat: `<b>` tags take no room. */
const visibleWidth = (line: string): number => line.replace(/<\/?b>/g, '').length;

/** `╔═══[ label ]═══╗`, `width` characters wide as far as the label allows, label centred. */
function rail(left: string, right: string, label: string, width: number): string {
  const fillWidth = Math.max(width - 2 - visibleWidth(label) - 4, 0);
  const before = Math.floor(fillWidth / 2);
  return `${left}${'═'.repeat(before)}[ ${label} ]${'═'.repeat(fillWidth - before)}${right}`;
}

/** A row between the side rails, padded to `width`. */
function boxRow(content: string, width: number): string {
  const pad = Math.max(0, width - RAIL_LEFT.length - RAIL_RIGHT.length - visibleWidth(content));
  return `${RAIL_LEFT}${content}${' '.repeat(pad)}${RAIL_RIGHT}`;
}
/**
 * Widest a line of the message may run, in visible characters (`<b>` tags
 * don't show). RockRadar's own message is the benchmark: its widest lines are
 * about 52 characters, and they never wrap. Most of those are box-drawing
 * characters, which run wider than letters in the chat window's proportional
 * font, so a line of plain text can be a little longer than that and still fit.
 */
export const MAX_LINE_WIDTH = 60;
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

/**
 * The bar row: the bar fills the box's width once the percent after it has its
 * room. No end caps: they indent the bar and read thin next to the blocks.
 */
function barLine(percent: number, finished: boolean, width: number): string {
  const tail = ` ${percent}%`;
  const cells = Math.max(width - RAIL_LEFT.length - RAIL_RIGHT.length - tail.length, MIN_BAR_CELLS);
  const filled = finished ? cells : Math.floor((percent / 100) * cells);
  return boxRow(`${'█'.repeat(filled)}${'░'.repeat(cells - filled)}${tail}`, width);
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
  const prefixWidth = RAIL_LEFT.length + RAIL_RIGHT.length + fill(labels.left, { ores: '' }).length;
  const listed: string[] = [];
  let named = 0;
  for (const ore of ores.slice(0, MAX_NAMED_ORES)) {
    const entry = `${ore.rocks} ${short[ore.ore]}`;
    const rest = rocksIn(ores.slice(named + 1));
    const other = rest > 0 ? [fill(labels.more, { count: rest })] : [];
    const width = prefixWidth + [...listed, entry, ...other].join(SEPARATOR).length;
    if (listed.length > 0 && width > MAX_LINE_WIDTH) break;
    listed.push(entry);
    named++;
  }
  const other = rocksIn(ores.slice(named));
  if (other > 0) listed.push(fill(labels.more, { count: other }));
  return fill(labels.left, { ores: listed.join(SEPARATOR) });
}

export function surveyChatMessage(
  summary: SurveySummary,
  url: string,
  labels: SurveyMessageLabels
): string {
  // The narrowest a rail can be and still hold its label: `╚[ label ]╝`, no `═` to spare.
  const railWidth = (label: string): number => 2 + 4 + visibleWidth(label);

  if (summary.finished) {
    const headline = fill(labels.cleared, { duration: formatDuration(summary.elapsedMs) });
    const width = Math.max(railWidth(headline), railWidth(url));
    return [
      rail('╔', '╗', headline, width),
      barLine(100, true, width),
      rail('╚', '╝', url, width),
    ].join('\n');
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
  const left = oreLine(present, shortOreNames(present.map((o) => o.ore)), labels);
  const width = Math.max(
    RAIL_LEFT.length + visibleWidth(left) + RAIL_RIGHT.length,
    railWidth(timing),
    railWidth(url)
  );

  return [
    rail('╔', '╗', timing, width),
    barLine(summary.percent, false, width),
    boxRow(left, width),
    rail('╚', '╝', url, width),
  ].join('\n');
}
