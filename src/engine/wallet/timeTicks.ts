import { HOUR_MS, DAY_MS } from '@/lib/age';

const TIME_TICK_SPAN_MS = 2 * DAY_MS;

export interface TimeAxisTicks {
  ticks: number[];
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

function zonedMidnight(y: number, m: number, d: number, timeZone: string | undefined): number {
  const wall = Date.UTC(y, m - 1, d);
  let guess = wall;
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
    const count = Math.min(limit, 2 + Math.floor((max - min) / HOUR_MS));
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
