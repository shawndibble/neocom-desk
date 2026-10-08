/**
 * A Survey read as a series of Survey Scans: how much of the field is mined,
 * how fast, and when it will be gone. Pure — the scans arrive already parsed
 * (and, for a shared Survey, already fetched); nothing here reads a clock.
 */

export interface SurveyRock {
  /** Ore name as the scanner printed it, e.g. "Glistening Sylvite". */
  ore: string;
  /** Volume still in the rock, m³. */
  volume: number;
  /** Ore units still in the rock, as the scanner reports them. */
  units?: number;
  /** Distance from the scanning ship, metres. */
  distanceM?: number;
}

export interface SurveyScan {
  /** When the scan was taken, epoch ms. */
  at: number;
  rocks: SurveyRock[];
}

export interface SurveyInterval {
  from: number;
  to: number;
  /** m³ that left the field between the two scans: rocks shrunk or gone. */
  mined: number;
  /** m³ of rocks in the later scan that the earlier one never showed. */
  added: number;
  /** m³/s over the interval. */
  rate: number;
}

export interface SurveyOre {
  ore: string;
  rocks: number;
  volume: number;
}

/** One scan as a point on the volume chart. */
export interface SurveyPoint {
  at: number;
  total: number;
  /** Volume left per ore, m³. */
  byOre: Record<string, number>;
}

export interface SurveySummary {
  /** Everything the scans have shown of the field: the first scan plus rocks that came into range. */
  startVolume: number;
  leftVolume: number;
  /** Whole percent mined. Reads 100 only once the field is empty. */
  percent: number;
  rocksLeft: number;
  /** Ores still in the field, biggest first. */
  ores: SurveyOre[];
  intervals: SurveyInterval[];
  /** Every scan, oldest first, for the chart. */
  points: SurveyPoint[];
  /** Every ore any scan showed, biggest first at the start, so chart layers keep their order. */
  oreNames: string[];
  /** m³/s over the last few intervals, or null before there is any real mining. */
  pace: number | null;
  /** Epoch ms the field runs out at that pace; null when unknown or finished. */
  etaAt: number | null;
  finished: boolean;
  /** Time of the first scan that found the field empty. */
  finishedAt: number | null;
  /** First scan to `finishedAt`, or to the latest scan while still mining. */
  elapsedMs: number;
  firstAt: number;
  lastAt: number;
}

/** How many of the latest intervals the pace is averaged over. */
export const PACE_INTERVALS = 3;

const total = (scan: SurveyScan): number => scan.rocks.reduce((sum, r) => sum + r.volume, 0);

/**
 * What changed between two scans. A scan only shows the rocks in range, so
 * totals alone can't be compared. Rocks are matched by ore: biggest first,
 * each later rock takes the smallest earlier rock of that ore at least as
 * big (rocks only shrink). An earlier rock nothing matched is mined out; a
 * later rock nothing matched came into range and extends the field.
 */
function diffScans(before: SurveyScan, after: SurveyScan): { mined: number; added: number } {
  const unused = new Map<string, number[]>();
  for (const r of before.rocks) unused.set(r.ore, [...(unused.get(r.ore) ?? []), r.volume]);
  for (const list of unused.values()) list.sort((a, b) => a - b);

  let mined = 0;
  let added = 0;
  for (const rock of [...after.rocks].sort((a, b) => b.volume - a.volume)) {
    const list = unused.get(rock.ore) ?? [];
    const at = list.findIndex((v) => v >= rock.volume);
    if (at === -1) {
      added += rock.volume;
    } else {
      mined += list[at] - rock.volume;
      list.splice(at, 1);
    }
  }
  for (const list of unused.values()) for (const v of list) mined += v;
  return { mined, added };
}

export function summarizeSurvey(input: readonly SurveyScan[]): SurveySummary | null {
  const scans: SurveyScan[] = [];
  for (const s of [...input].sort((a, b) => a.at - b.at)) {
    if (scans.length > 0 && scans[scans.length - 1].at === s.at) continue;
    scans.push(s);
  }
  if (scans.length === 0) return null;

  const first = scans[0];
  const last = scans[scans.length - 1];
  const leftVolume = total(last);

  const intervals: SurveyInterval[] = [];
  for (let i = 1; i < scans.length; i++) {
    const { mined, added } = diffScans(scans[i - 1], scans[i]);
    const seconds = (scans[i].at - scans[i - 1].at) / 1000;
    intervals.push({
      from: scans[i - 1].at,
      to: scans[i].at,
      mined,
      added,
      rate: mined / seconds,
    });
  }

  const startVolume = total(first) + intervals.reduce((sum, i) => sum + i.added, 0);

  const points: SurveyPoint[] = scans.map((scan) => {
    const byOre: Record<string, number> = {};
    for (const rock of scan.rocks) byOre[rock.ore] = (byOre[rock.ore] ?? 0) + rock.volume;
    return { at: scan.at, total: total(scan), byOre };
  });
  const oreNames: string[] = [];
  for (const point of [...points].reverse()) {
    for (const ore of Object.keys(point.byOre)) if (!oreNames.includes(ore)) oreNames.push(ore);
  }
  const peak = (ore: string): number => Math.max(...points.map((p) => p.byOre[ore] ?? 0));
  oreNames.sort((a, b) => peak(b) - peak(a));

  const recent = intervals.slice(-PACE_INTERVALS);
  const minedRecent = recent.reduce((sum, i) => sum + i.mined, 0);
  const secondsRecent = recent.reduce((sum, i) => sum + (i.to - i.from) / 1000, 0);
  const pace = minedRecent > 0 ? minedRecent / secondsRecent : null;

  const finished = leftVolume === 0;
  const finishedScan = finished ? scans.find((s) => total(s) === 0) : undefined;
  const etaAt = !finished && pace !== null ? last.at + (leftVolume / pace) * 1000 : null;

  let percent = startVolume > 0 ? Math.round((1 - leftVolume / startVolume) * 100) : 0;
  if (!finished) percent = Math.min(percent, 99);
  else percent = 100;

  const byOre = new Map<string, SurveyOre>();
  for (const rock of last.rocks) {
    const entry = byOre.get(rock.ore) ?? { ore: rock.ore, rocks: 0, volume: 0 };
    entry.rocks += 1;
    entry.volume += rock.volume;
    byOre.set(rock.ore, entry);
  }
  const ores = [...byOre.values()].sort((a, b) => b.volume - a.volume);

  return {
    startVolume,
    leftVolume,
    percent,
    rocksLeft: last.rocks.length,
    ores,
    intervals,
    points,
    oreNames,
    pace,
    etaAt,
    finished,
    finishedAt: finishedScan?.at ?? null,
    elapsedMs: (finishedScan?.at ?? last.at) - first.at,
    firstAt: first.at,
    lastAt: last.at,
  };
}
