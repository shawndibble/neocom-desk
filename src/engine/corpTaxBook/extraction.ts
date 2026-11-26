import type { ObservedMiningEntry, OreLine } from './types';
import { HOUR_MS } from '@/lib/age';

export const DEFAULT_EXPIRY_HOURS = 48;
export const MAX_EXPIRY_HOURS = 96;
export const DEFAULT_CHUNK_M3_PER_HOUR = 30_000;
export const MOON_ORE_M3_PER_UNIT = 10;

export interface Extraction {
  id: string;
  structureId: number;
  moonId: number;
  startedAt: string;
  chunkArrivalAt: string;
  naturalDecayAt: string;
  laserFiredAt?: string;
  cancelledAt?: string;
}

export type ExtractionState = 'extracting' | 'ready' | 'fractured' | 'expired' | 'cancelled';

export interface ExtractionStatus {
  state: ExtractionState;
  fracturedAt?: string;
  fracturedBy?: 'laser' | 'auto';
  expiresAt?: string;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function fractureAndExpiry(ex: Extraction, expiryHours: number | undefined) {
  const fracturedBy: 'laser' | 'auto' = ex.laserFiredAt ? 'laser' : 'auto';
  const fracturedAt = Date.parse(ex.laserFiredAt ?? ex.naturalDecayAt);
  const hours = Math.min(expiryHours ?? DEFAULT_EXPIRY_HOURS, MAX_EXPIRY_HOURS);
  return { fracturedAt, fracturedBy, expiresAt: fracturedAt + hours * HOUR_MS };
}

export function extractionStatus(
  ex: Extraction,
  now: string,
  opts: { expiryHours?: number; fullyMinedAt?: string } = {}
): ExtractionStatus {
  if (ex.cancelledAt) return { state: 'cancelled' };
  const t = Date.parse(now);
  if (t < Date.parse(ex.chunkArrivalAt)) return { state: 'extracting' };
  const planned = fractureAndExpiry(ex, opts.expiryHours);
  const { fracturedAt, fracturedBy } = planned;
  if (t < fracturedAt) return { state: 'ready' };
  const flaggedAt = opts.fullyMinedAt ? Date.parse(opts.fullyMinedAt) : NaN;
  const expiresAt = Number.isNaN(flaggedAt)
    ? planned.expiresAt
    : Math.min(planned.expiresAt, Math.max(fracturedAt, flaggedAt));
  return {
    state: t < expiresAt ? 'fractured' : 'expired',
    fracturedAt: iso(fracturedAt),
    fracturedBy,
    expiresAt: iso(expiresAt),
  };
}

export interface ChunkSources {
  notified?: readonly { typeId: number; volumeM3: number }[];
  survey?: readonly { typeId: number; fraction: number }[];
  surveyVolumeM3?: number;
  surveyAt?: number;
  expiryHours?: number;
  chunkM3PerHour?: number;
  measured?: LearnedChunkRate;
}

export const MEASURED_RATE_WINDOW = 5;

export interface LearnedChunkRate {
  m3PerHour: number;
  cycles: number;
}

export interface ChunkRate {
  m3PerHour: number;
  basis: 'measured' | 'manual' | 'default';
  cycles?: number;
}

export function chunkRateFor(
  measured: LearnedChunkRate | undefined,
  manual: number | undefined
): ChunkRate {
  if (measured)
    return { m3PerHour: measured.m3PerHour, basis: 'measured', cycles: measured.cycles };
  if (manual !== undefined) return { m3PerHour: manual, basis: 'manual' };
  return { m3PerHour: DEFAULT_CHUNK_M3_PER_HOUR, basis: 'default' };
}

export interface MeasurableExtraction {
  structureId: number;
  startedAt: string;
  chunkArrivalAt: string;
  oreLines?: readonly { typeId: number; quantity: number }[];
}

export function measureChunkRate(ex: MeasurableExtraction): number | undefined {
  if (!ex.oreLines?.length) return undefined;
  const hours = (Date.parse(ex.chunkArrivalAt) - Date.parse(ex.startedAt)) / HOUR_MS;
  const units = ex.oreLines.reduce((sum, l) => sum + l.quantity, 0);
  if (!(hours > 0) || units <= 0) return undefined;
  return (units * MOON_ORE_M3_PER_UNIT) / hours;
}

export function learnChunkRates(
  extractions: readonly MeasurableExtraction[]
): Map<number, LearnedChunkRate> {
  const byStructure = new Map<number, { startedAt: string; rate: number }[]>();
  for (const ex of extractions) {
    const rate = measureChunkRate(ex);
    if (rate === undefined) continue;
    const list = byStructure.get(ex.structureId) ?? [];
    list.push({ startedAt: ex.startedAt, rate });
    byStructure.set(ex.structureId, list);
  }
  const learned = new Map<number, LearnedChunkRate>();
  for (const [structureId, list] of byStructure) {
    const recent = list
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, MEASURED_RATE_WINDOW)
      .map((c) => c.rate)
      .sort((a, b) => a - b);
    const mid = recent.length >> 1;
    const median = recent.length % 2 ? recent[mid] : (recent[mid - 1] + recent[mid]) / 2;
    learned.set(structureId, { m3PerHour: Math.round(median), cycles: recent.length });
  }
  return learned;
}

export interface SurveyScanSnapshot {
  at?: number;
  volumeM3: number;
  ores: { typeId: number; volumeM3: number }[];
}

export function surveySnapshotOf(
  rocks: readonly { ore: string; volume: number }[],
  typeIdOf: (ore: string) => number | undefined,
  at?: number
): SurveyScanSnapshot {
  const byType = new Map<number, number>();
  let volumeM3 = 0;
  for (const rock of rocks) {
    if (!(rock.volume > 0)) continue;
    volumeM3 += rock.volume;
    const typeId = typeIdOf(rock.ore);
    if (typeId !== undefined) byType.set(typeId, (byType.get(typeId) ?? 0) + rock.volume);
  }
  return {
    ...(at !== undefined ? { at } : {}),
    volumeM3,
    ores: [...byType]
      .map(([typeId, v]) => ({ typeId, volumeM3: v }))
      .sort((a, b) => a.typeId - b.typeId),
  };
}

function snapshotFractions(s: SurveyScanSnapshot): { typeId: number; fraction: number }[] {
  const total = s.ores.reduce((sum, o) => sum + o.volumeM3, 0);
  if (total === 0) return [];
  return s.ores.map((o) => ({ typeId: o.typeId, fraction: o.volumeM3 / total }));
}

export function surveyFractions(
  rocks: readonly { ore: string; volume: number }[],
  typeIdOf: (ore: string) => number | undefined
): { typeId: number; fraction: number }[] {
  return snapshotFractions(surveySnapshotOf(rocks, typeIdOf));
}

export function snapshotSources(
  s: SurveyScanSnapshot
): Pick<ChunkSources, 'survey' | 'surveyVolumeM3' | 'surveyAt'> {
  return {
    survey: snapshotFractions(s),
    surveyVolumeM3: s.volumeM3,
    ...(s.at !== undefined ? { surveyAt: s.at } : {}),
  };
}

export interface ChunkEstimate {
  source: 'notification' | 'survey' | 'unknown';
  oreLines: OreLine[];
  rate?: ChunkRate;
  measuredVolume?: boolean;
}

function scanInCycle(ex: Extraction, at: number | undefined, expiryHours: number | undefined) {
  if (at === undefined) return true;
  return at >= Date.parse(ex.chunkArrivalAt) && at <= fractureAndExpiry(ex, expiryHours).expiresAt;
}

export function estimateChunk(ex: Extraction, sources: ChunkSources): ChunkEstimate {
  const units = (m3: number): number => Math.floor(m3 / MOON_ORE_M3_PER_UNIT);
  if (sources.notified?.length) {
    return {
      source: 'notification',
      oreLines: sources.notified.map((o) => ({ typeId: o.typeId, quantity: units(o.volumeM3) })),
    };
  }
  if (sources.survey?.length) {
    const volume = sources.surveyVolumeM3;
    const useMeasured =
      volume !== undefined && volume > 0 && scanInCycle(ex, sources.surveyAt, sources.expiryHours);
    const hours = (Date.parse(ex.chunkArrivalAt) - Date.parse(ex.startedAt)) / HOUR_MS;
    const rate = chunkRateFor(sources.measured, sources.chunkM3PerHour);
    const chunkM3 = useMeasured ? volume : hours * rate.m3PerHour;
    return {
      ...(useMeasured ? { measuredVolume: true } : { rate }),
      source: 'survey',
      oreLines: sources.survey.map((o) => ({
        typeId: o.typeId,
        quantity: units(chunkM3 * o.fraction),
      })),
    };
  }
  return { source: 'unknown', oreLines: [] };
}

export function minedDuringExtraction(
  ex: Extraction,
  entries: readonly ObservedMiningEntry[],
  opts: { expiryHours?: number } = {}
): OreLine[] {
  const { fracturedAt, expiresAt } = fractureAndExpiry(ex, opts.expiryHours);
  const from = iso(fracturedAt).slice(0, 10);
  const through = iso(expiresAt).slice(0, 10);
  const mined = new Map<number, number>();
  for (const entry of entries) {
    if (entry.structureId !== ex.structureId || entry.date < from || entry.date > through) continue;
    for (const line of entry.oreLines) {
      mined.set(line.typeId, (mined.get(line.typeId) ?? 0) + line.quantity);
    }
  }
  return [...mined]
    .map(([typeId, quantity]) => ({ typeId, quantity }))
    .sort((a, b) => a.typeId - b.typeId);
}

export interface OreProgress {
  typeId: number;
  estimated: number;
  mined: number;
  left: number;
}

export function minedVsLeft(
  estimate: readonly OreLine[],
  mined: readonly OreLine[]
): OreProgress[] {
  return estimate.map((line) => {
    const got = mined.find((m) => m.typeId === line.typeId)?.quantity ?? 0;
    return {
      typeId: line.typeId,
      estimated: line.quantity,
      mined: got,
      left: Math.max(0, line.quantity - got),
    };
  });
}
