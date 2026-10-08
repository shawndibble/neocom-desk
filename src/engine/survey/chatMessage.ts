/**
 * The message the Survey tab's "Copy chat message" button puts on the
 * clipboard, for pasting into an in-game channel.
 *
 * In-game chat keeps `<b>` and drops colour, size, hint and link tags, so
 * the style is words and block characters. Wording comes in as `labels`
 * (this engine imports no i18n); a label's `{placeholders}` are filled here.
 */
import type { SurveySummary } from './series';

export interface SurveyMessageLabels {
  cracking: string;
  halfway: string;
  almost: string;
  last: string;
  /** `{time}` is HH:MM EVE time, `{left}` the time remaining. */
  done: string;
  waiting: string;
  /** `{ores}` is the joined ore list. */
  left: string;
  /** `{count}` ores not listed. */
  more: string;
  /** `{duration}` is the whole mining time. */
  cleared: string;
}

const BAR_CELLS = 20;
/**
 * Widest a line of the message may run, in visible characters (`<b>` tags
 * don't show). RockRadar's own message is the benchmark: its widest line is
 * about 50 characters and it never wraps in the chat window.
 */
export const MAX_LINE_WIDTH = 50;
const SEPARATOR = ' · ';

/** Words that start a two-word ore name without being a quality prefix. */
const NAME_LEADERS = new Set(['Dark']);

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
    return words.length > 1 && !NAME_LEADERS.has(words[0]) ? words.slice(1).join(' ') : name;
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

function clock(epochMs: number): string {
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

function statusWord(percent: number, labels: SurveyMessageLabels): string {
  if (percent < 25) return labels.cracking;
  if (percent < 75) return labels.halfway;
  if (percent < 95) return labels.almost;
  return labels.last;
}

function bar(percent: number, finished: boolean): string {
  const filled = finished ? BAR_CELLS : Math.floor((percent / 100) * BAR_CELLS);
  return `▕${'█'.repeat(filled)}${'░'.repeat(BAR_CELLS - filled)}▏ ${percent}%`;
}

/** "Left: 19 Pyroxeres · 13 Pyroxeres II · +4 more", as many ores as fit one line. */
function oreLine(
  ores: SurveySummary['ores'],
  short: Record<string, string>,
  labels: SurveyMessageLabels
): string {
  const entries = ores.map((o) => `${o.rocks} ${short[o.ore]}`);
  const prefixWidth = fill(labels.left, { ores: '' }).length;
  const listed: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const rest = entries.length - (i + 1);
    const more = rest > 0 ? [fill(labels.more, { count: rest })] : [];
    const width = prefixWidth + [...listed, entries[i], ...more].join(SEPARATOR).length;
    if (listed.length > 0 && width > MAX_LINE_WIDTH) break;
    listed.push(entries[i]);
  }
  const hidden = entries.length - listed.length;
  if (hidden > 0) listed.push(fill(labels.more, { count: hidden }));
  return fill(labels.left, { ores: listed.join(SEPARATOR) });
}

export function surveyChatMessage(
  summary: SurveySummary,
  url: string,
  labels: SurveyMessageLabels
): string {
  if (summary.finished) {
    return [
      fill(labels.cleared, { duration: formatDuration(summary.elapsedMs) }),
      bar(100, true),
      url,
    ].join('\n');
  }

  const status = statusWord(summary.percent, labels);
  const timing =
    summary.etaAt === null
      ? labels.waiting
      : fill(labels.done, {
          time: clock(summary.etaAt),
          left: formatDuration(summary.etaAt - summary.lastAt),
        });

  const left = oreLine(summary.ores, shortOreNames(summary.ores.map((o) => o.ore)), labels);

  return [`${status}${SEPARATOR}${timing}`, bar(summary.percent, false), left, url].join('\n');
}
