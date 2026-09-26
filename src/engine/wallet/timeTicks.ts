/**
 * Tick positions for the Wallet Balance chart's time axis. Pure: the chart
 * scales its X axis by timestamp, so Recharts' own "nice" numbers would land
 * on arbitrary instants and repeat a date label; these fall on day boundaries
 * in the viewer's zone instead.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Below this span a date-only label would repeat, so ticks carry a time. */
const TIME_TICK_SPAN_MS = 2 * DAY;

export interface TimeAxisTicks {
  ticks: number[];
  /** True when the labels must show time of day, not just the date. */
  showTime: boolean;
}

function zoneParts(ts: number, timeZone: string | undefined) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ts));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    asUtc: Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second')
    ),
  };
}

/** The instant the wall-clock date `y-m-d` (00:00) begins in `timeZone`. */
function zonedMidnight(y: number, m: number, d: number, timeZone: string | undefined): number {
  const wall = Date.UTC(y, m - 1, d);
  let guess = wall;
  // Offset depends on the instant, so settle it in two passes (covers DST edges).
  for (let i = 0; i < 2; i++) {
    guess = wall - (zoneParts(guess, timeZone).asUtc - guess);
  }
  return guess;
}

export function timeAxisTicks(
  min: number,
  max: number,
  timeZone: string | undefined,
  maxTicks: number
): TimeAxisTicks {
  const limit = Math.max(1, Math.floor(maxTicks));
  if (!(max > min)) return { ticks: [min], showTime: true };

  if (max - min < TIME_TICK_SPAN_MS) {
    const count = Math.min(limit, 2 + Math.floor((max - min) / HOUR));
    const ticks = new Set<number>();
    for (let i = 0; i < count; i++) {
      ticks.add(Math.round(min + ((max - min) * i) / Math.max(1, count - 1)));
    }
    return { ticks: [...ticks], showTime: true };
  }

  const start = zoneParts(min, timeZone);
  const days: number[] = [];
  for (let n = 0; ; n++) {
    const t = zonedMidnight(start.year, start.month, start.day + n, timeZone);
    if (t > max) break;
    if (t >= min) days.push(t);
  }
  const stride = Math.max(1, Math.ceil(days.length / limit));
  return { ticks: days.filter((_, i) => i % stride === 0), showTime: false };
}
