import type { GapAxis } from './gapAxis';

export interface SurveyRock {
  ore: string;
  volume: number;
  units?: number;
  isk?: number;
  distanceM?: number;
}

export interface SurveyScan {
  id?: string;
  at: number;
  rocks: SurveyRock[];
  by?: string;
}

export interface SurveyInterval {
  from: number;
  to: number;
  mined: number;
  added: number;
  rate: number;
  minedIsk: number;
  minedByOre: Record<string, number>;
  gap?: true;
}

export interface SurveyOre {
  ore: string;
  rocks: number;
  volume: number;
  isk: number;
  startVolume: number;
  unitPrice: number | null;
}

export interface SurveyPoint {
  at: number;
  total: number;
  byOre: Record<string, number>;
  iskByOre: Record<string, number>;
  by?: string;
}

export interface SurveySummary {
  startVolume: number;
  leftVolume: number;
  percent: number;
  rocksLeft: number;
  iskLeft: number | null;
  ores: SurveyOre[];
  intervals: SurveyInterval[];
  points: SurveyPoint[];
  oreNames: string[];
  pace: number | null;
  etaAt: number | null;
  finished: boolean;
  finishedAt: number | null;
  elapsedMs: number;
  firstAt: number;
  lastAt: number;
  axis?: GapAxis;
}

export const PACE_INTERVALS = 2;

function oreTotals(scan: SurveyScan): {
  byOre: Record<string, number>;
  iskByOre: Record<string, number>;
} {
  const byOre: Record<string, number> = {};
  const iskByOre: Record<string, number> = {};
  for (const rock of scan.rocks) {
    byOre[rock.ore] = (byOre[rock.ore] ?? 0) + rock.volume;
    iskByOre[rock.ore] = (iskByOre[rock.ore] ?? 0) + (rock.isk ?? 0);
  }
  return { byOre, iskByOre };
}

export const scanVolume = (rocks: readonly { volume: number }[]): number =>
  rocks.reduce((sum, r) => (r.volume > 0 ? sum + r.volume : sum), 0);

const total = (scan: SurveyScan): number => scanVolume(scan.rocks);

function diffScans(
  before: SurveyScan,
  after: SurveyScan
): {
  mined: number;
  added: number;
  addedByOre: Record<string, number>;
  minedByOre: Record<string, number>;
} {
  const unused = new Map<string, number[]>();
  for (const r of before.rocks) unused.set(r.ore, [...(unused.get(r.ore) ?? []), r.volume]);
  for (const list of unused.values()) list.sort((a, b) => a - b);

  let mined = 0;
  let added = 0;
  const addedByOre: Record<string, number> = {};
  const minedByOre: Record<string, number> = {};
  const mine = (ore: string, v: number) => {
    mined += v;
    minedByOre[ore] = (minedByOre[ore] ?? 0) + v;
  };
  for (const rock of [...after.rocks].sort((a, b) => b.volume - a.volume)) {
    const list = unused.get(rock.ore) ?? [];
    const at = list.findIndex((v) => v >= rock.volume);
    if (at === -1) {
      added += rock.volume;
      addedByOre[rock.ore] = (addedByOre[rock.ore] ?? 0) + rock.volume;
    } else {
      mine(rock.ore, list[at] - rock.volume);
      list.splice(at, 1);
    }
  }
  for (const [ore, list] of unused) for (const v of list) mine(ore, v);
  return { mined, added, addedByOre, minedByOre };
}

export function countedScans(
  scans: readonly SurveyScan[],
  ignored: ReadonlySet<string>
): SurveyScan[] {
  return scans.filter((s) => s.id === undefined || !ignored.has(s.id));
}

export function firstCountedScan(
  scans: readonly SurveyScan[],
  ignored: ReadonlySet<string>
): SurveyScan | undefined {
  return countedScans(scans, ignored).reduce<SurveyScan | undefined>(
    (a, b) => (a === undefined || b.at < a.at ? b : a),
    undefined
  );
}

const signature = (scan: SurveyScan): string =>
  scan.rocks
    .map((r) => `${r.ore}|${r.volume}`)
    .sort()
    .join(';');

export function summarizeSurvey(
  input: readonly SurveyScan[],
  unitPrices?: ReadonlyMap<string, number>
): SurveySummary | null {
  const scans: SurveyScan[] = [];
  const seen = new Set<string>();
  for (const s of [...input].sort((a, b) => a.at - b.at)) {
    const previous = scans[scans.length - 1];
    if (previous !== undefined && previous.at === s.at) continue;
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
    const { mined, added, addedByOre, minedByOre } = diffScans(scans[i - 1], scans[i]);
    const earlier = oreTotals(scans[i - 1]);
    let minedIsk = 0;
    for (const [ore, volume] of Object.entries(minedByOre)) {
      const had = earlier.byOre[ore] ?? 0;
      if (had > 0) minedIsk += volume * ((earlier.iskByOre[ore] ?? 0) / had);
    }
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
      minedIsk,
      minedByOre: Object.fromEntries(Object.entries(minedByOre).filter(([, v]) => v > 0)),
    });
  }

  const startVolume = total(first) + intervals.reduce((sum, i) => sum + i.added, 0);

  const points: SurveyPoint[] = scans.map((scan) => {
    const { byOre, iskByOre } = oreTotals(scan);
    return {
      at: scan.at,
      total: total(scan),
      byOre,
      iskByOre,
      ...(scan.by === undefined ? {} : { by: scan.by }),
    };
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
    byOre.set(ore, {
      ore,
      rocks: 0,
      volume: 0,
      isk: 0,
      startVolume,
      unitPrice: unitPrices?.get(ore) ?? null,
    });
  }
  for (const rock of last.rocks) {
    const entry = byOre.get(rock.ore)!;
    entry.rocks += 1;
    entry.volume += rock.volume;
    entry.isk += rock.isk ?? 0;
  }
  const hasIsk = last.rocks.some((r) => r.isk !== undefined);
  const rank = (o: SurveyOre): number => (hasIsk ? o.isk : o.volume);
  const ores = [...byOre.values()].sort((a, b) => {
    if (a.unitPrice === null && b.unitPrice === null) {
      return rank(b) - rank(a) || b.volume - a.volume || b.startVolume - a.startVolume;
    }
    return (b.unitPrice ?? -1) - (a.unitPrice ?? -1) || a.ore.localeCompare(b.ore);
  });

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
    oreNames: ores.map((o) => o.ore),
    pace,
    etaAt,
    finished,
    finishedAt: finishedScan?.at ?? null,
    elapsedMs: (finishedScan?.at ?? last.at) - first.at,
    firstAt: first.at,
    lastAt: last.at,
  };
}
