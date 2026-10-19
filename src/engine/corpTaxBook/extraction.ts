/**
 * Extraction lifecycle and chunk estimate (D13, D14). An Extraction is
 * Extracting until its chunk arrives (Ready), Fractured when the laser is
 * fired or the chunk breaks on its own at `natural_decay_time`, and Expired
 * once the field is assumed gone: fracture + 48h by default, overridable per
 * structure up to 4 days. ESI lists only current extractions and no ore, so
 * the chunk's make-up comes from the ExtractionStarted notification, else a
 * linked Moon Ore Survey, else it is unknown.
 */
import type { ObservedMiningEntry, OreLine } from './types';

export const DEFAULT_EXPIRY_HOURS = 48;
export const MAX_EXPIRY_HOURS = 96;
/** Sources disagree (20k, 30k, ~40k m³/h); the book makes it configurable. */
export const DEFAULT_CHUNK_M3_PER_HOUR = 30_000;
/** Every moon ore is 10 m³ per unit. */
export const MOON_ORE_M3_PER_UNIT = 10;

const HOUR_MS = 3_600_000;

export interface Extraction {
  id: string;
  structureId: number;
  moonId: number;
  startedAt: string;
  chunkArrivalAt: string;
  /** ESI's `natural_decay_time`: when the chunk fractures on its own. */
  naturalDecayAt: string;
  /** From the LaserFired notification. */
  laserFiredAt?: string;
  /** From the ExtractionCancelled notification. */
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

function fractureAndExpiry(ex: Extraction, expiryHours: number | undefined) {
  const fracturedBy: 'laser' | 'auto' = ex.laserFiredAt ? 'laser' : 'auto';
  const fracturedAt = Date.parse(ex.laserFiredAt ?? ex.naturalDecayAt);
  const hours = Math.min(expiryHours ?? DEFAULT_EXPIRY_HOURS, MAX_EXPIRY_HOURS);
  return { fracturedAt, fracturedBy, expiresAt: fracturedAt + hours * HOUR_MS };
}

export function extractionStatus(
  ex: Extraction,
  now: string,
  opts: { expiryHours?: number } = {}
): ExtractionStatus {
  if (ex.cancelledAt) return { state: 'cancelled' };
  const t = Date.parse(now);
  if (t < Date.parse(ex.chunkArrivalAt)) return { state: 'extracting' };
  const { fracturedAt, fracturedBy, expiresAt } = fractureAndExpiry(ex, opts.expiryHours);
  if (t < fracturedAt) return { state: 'ready' };
  return {
    state: t < expiresAt ? 'fractured' : 'expired',
    fracturedAt: iso(fracturedAt),
    fracturedBy,
    expiresAt: iso(expiresAt),
  };
}

export interface ChunkSources {
  /** Ore volumes from the MoonminingExtractionStarted notification. */
  notified?: readonly { typeId: number; volumeM3: number }[];
  /** A linked Moon Ore Survey's composition, as fractions of the chunk. */
  survey?: readonly { typeId: number; fraction: number }[];
  chunkM3PerHour?: number;
}

/**
 * A linked Moon Ore Survey's composition as shares of its volume: the rocks of
 * its first scan summed per ore. An ore the type lookup cannot name is left
 * out and the rest renormalised, so the shares always sum to 1.
 */
export function surveyFractions(
  rocks: readonly { ore: string; volume: number }[],
  typeIdOf: (ore: string) => number | undefined
): { typeId: number; fraction: number }[] {
  const byType = new Map<number, number>();
  for (const rock of rocks) {
    const typeId = typeIdOf(rock.ore);
    if (typeId !== undefined && rock.volume > 0) {
      byType.set(typeId, (byType.get(typeId) ?? 0) + rock.volume);
    }
  }
  const total = [...byType.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  return [...byType]
    .map(([typeId, volume]) => ({ typeId, fraction: volume / total }))
    .sort((a, b) => a.typeId - b.typeId);
}

export interface ChunkEstimate {
  source: 'notification' | 'survey' | 'unknown';
  oreLines: OreLine[];
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
    const hours = (Date.parse(ex.chunkArrivalAt) - Date.parse(ex.startedAt)) / HOUR_MS;
    const chunkM3 = hours * (sources.chunkM3PerHour ?? DEFAULT_CHUNK_M3_PER_HOUR);
    return {
      source: 'survey',
      oreLines: sources.survey.map((o) => ({
        typeId: o.typeId,
        quantity: units(chunkM3 * o.fraction),
      })),
    };
  }
  return { source: 'unknown', oreLines: [] };
}

/** The ore mined at the Extraction's refinery from its fracture day through its expiry day, per type. */
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

/** Mined vs left per ore type of the estimate, after fracture. */
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
