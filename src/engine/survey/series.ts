/**
 * A Survey read as a series of Survey Scans: how much of the field is mined,
 * how fast, and when it will be gone. Pure — the scans arrive already parsed
 * (and, for a shared Survey, already fetched); nothing here reads a clock.
 */
import { sortByValuePerM3 } from './valueTier';

export interface SurveyRock {
  /** Ore name as the scanner printed it, e.g. "Glistening Sylvite". */
  ore: string;
  /** Volume still in the rock, m³. */
  volume: number;
  /** Ore units still in the rock, as the scanner reports them. */
  units?: number;
  /** The scanner's own ISK value for what is left in the rock. */
  isk?: number;
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
  /** Rocks of this ore still in the latest scan; 0 once the ore is mined out. */
  rocks: number;
  /** m³ of it left. */
  volume: number;
  /** The scanner's ISK value of what is left of it; 0 when no row carried one. */
  isk: number;
  /** m³ of it the scans have shown in all: its first showing plus any that came into range. */
  startVolume: number;
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
  /** The scanner's ISK value of everything left, summed; null when no row carried one. */
  iskLeft: number | null;
  /** Every ore the scans showed, the most valuable left first (biggest volume when no scan carries ISK); mined-out ores last. */
  ores: SurveyOre[];
  intervals: SurveyInterval[];
  /** Every scan, oldest first, for the chart. */
  points: SurveyPoint[];
  /** Every ore any scan showed, in `ores` order (most valuable left first), so chart layers read like the ore list. */
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
function diffScans(
  before: SurveyScan,
  after: SurveyScan
): { mined: number; added: number; addedByOre: Record<string, number> } {
  const unused = new Map<string, number[]>();
  for (const r of before.rocks) unused.set(r.ore, [...(unused.get(r.ore) ?? []), r.volume]);
  for (const list of unused.values()) list.sort((a, b) => a - b);

  let mined = 0;
  let added = 0;
  const addedByOre: Record<string, number> = {};
  for (const rock of [...after.rocks].sort((a, b) => b.volume - a.volume)) {
    const list = unused.get(rock.ore) ?? [];
    const at = list.findIndex((v) => v >= rock.volume);
    if (at === -1) {
      added += rock.volume;
      addedByOre[rock.ore] = (addedByOre[rock.ore] ?? 0) + rock.volume;
    } else {
      mined += list[at] - rock.volume;
      list.splice(at, 1);
    }
  }
  for (const list of unused.values()) for (const v of list) mined += v;
  return { mined, added, addedByOre };
}

/** A scan's rocks as a comparable string, so a repaste of the same scan is recognised. */
const signature = (scan: SurveyScan): string =>
  scan.rocks
    .map((r) => `${r.ore}|${r.volume}`)
    .sort()
    .join(';');

export function summarizeSurvey(input: readonly SurveyScan[]): SurveySummary | null {
  const scans: SurveyScan[] = [];
  const seen = new Set<string>();
  for (const s of [...input].sort((a, b) => a.at - b.at)) {
    const previous = scans[scans.length - 1];
    if (previous !== undefined && previous.at === s.at) continue;
    // A scan the survey already has shows nothing new. Next to the one before
    // it, it would add an interval with no mining (dragging the pace down);
    // after a newer scan, it would read as the field growing back. Mining only
    // ever removes ore, so the same rocks can't be a later state.
    const sig = signature(s);
    if (seen.has(sig)) continue;
    seen.add(sig);
    scans.push(s);
  }
  if (scans.length === 0) return null;

  const first = scans[0];
  const last = scans[scans.length - 1];
  const leftVolume = total(last);

  const intervals: SurveyInterval[] = [];
  const startByOre: Record<string, number> = {};
  for (const rock of first.rocks) startByOre[rock.ore] = (startByOre[rock.ore] ?? 0) + rock.volume;
  for (let i = 1; i < scans.length; i++) {
    const { mined, added, addedByOre } = diffScans(scans[i - 1], scans[i]);
    for (const [ore, volume] of Object.entries(addedByOre)) {
      startByOre[ore] = (startByOre[ore] ?? 0) + volume;
    }
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
  for (const [ore, startVolume] of Object.entries(startByOre)) {
    byOre.set(ore, { ore, rocks: 0, volume: 0, isk: 0, startVolume });
  }
  for (const rock of last.rocks) {
    const entry = byOre.get(rock.ore)!;
    entry.rocks += 1;
    entry.volume += rock.volume;
    entry.isk += rock.isk ?? 0;
  }
  // Biggest value left first when the scan carries ISK, else biggest volume.
  const hasIsk = last.rocks.some((r) => r.isk !== undefined);
  const rank = (o: SurveyOre): number => (hasIsk ? o.isk : o.volume);
  const ores = [...byOre.values()].sort(
    (a, b) => rank(b) - rank(a) || b.volume - a.volume || b.startVolume - a.startVolume
  );

  return {
    startVolume,
    leftVolume,
    percent,
    rocksLeft: last.rocks.length,
    iskLeft: last.rocks.some((r) => r.isk !== undefined)
      ? last.rocks.reduce((sum, r) => sum + (r.isk ?? 0), 0)
      : null,
    ores,
    intervals,
    points,
    // The chart's layer order: richest per m³ first, as the ore bars list them.
    oreNames: (hasIsk ? sortByValuePerM3(ores) : ores).map((o) => o.ore),
    pace,
    etaAt,
    finished,
    finishedAt: finishedScan?.at ?? null,
    elapsedMs: (finishedScan?.at ?? last.at) - first.at,
    firstAt: first.at,
    lastAt: last.at,
  };
}
