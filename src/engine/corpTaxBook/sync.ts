import type { EveNotificationPayload } from '../eveNotificationPayload';
import { shiftDate } from '../miningTax/yieldRange';
import { matchBookOf, type MatchBook } from '../../../functions/src/corpTaxBookDonationMatch';
import {
  billableStoredRows,
  minedSinceStart,
  storedRowsWanted,
} from '../../../functions/src/corpTaxBookMatchRows';
import type { LateNotice } from '../../../functions/src/corpTaxBookLateNotice';
import type { TaxPayment } from './payments';
import type { Miner } from './charges';
import {
  MOON_ORE_M3_PER_UNIT,
  extractionStatus,
  type Extraction,
  type SurveyScanSnapshot,
} from './extraction';
import type { ObservedRow } from './types';
import { DAY_MS, MINUTE_MS } from '@/lib/age';
import { utcDay } from '@/engine/localDay';

export const ESI_LEDGER_RETENTION_DAYS = 30;
export const MOON_NOTIFICATION_TYPES = [
  'MoonminingExtractionStarted',
  'MoonminingExtractionFinished',
  'MoonminingLaserFired',
  'MoonminingAutomaticFracture',
  'MoonminingExtractionCancelled',
] as const;
export const STALE_AFTER_DAYS = 3;
export const MAX_GAPS = 20;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface LedgerRowLike {
  character_id: number;
  recorded_corporation_id: number;
  type_id: number;
  quantity: number;
  last_updated: string;
}

export function observedRowsFromLedger(
  structureId: number,
  rows: readonly LedgerRowLike[],
  cachedAt: string,
  sourceCorporationId?: number
): ObservedRow[] {
  return rows
    .filter(
      (r) => Number.isSafeInteger(r.quantity) && r.quantity > 0 && DATE.test(r.last_updated ?? '')
    )
    .map((r) => ({
      structureId,
      characterId: r.character_id,
      recordedCorporationId: r.recorded_corporation_id,
      typeId: r.type_id,
      date: r.last_updated,
      quantity: r.quantity,
      cachedAt,
      ...(sourceCorporationId !== undefined ? { sourceCorporationId } : {}),
    }));
}

export interface SyncGap {
  structureId: number;
  from: string;
  to: string;
}

export interface GapInput {
  lastSyncAt: number | null;
  now: number;
  startDate: string;
  structureIds: readonly number[];
  oldestEsiDate: Readonly<Record<number, string | undefined>>;
  retentionDays?: number;
}

export function detectGaps(input: GapInput): SyncGap[] {
  if (input.lastSyncAt === null) return [];
  const retention = input.retentionDays ?? ESI_LEDGER_RETENTION_DAYS;
  const horizon = shiftDate(utcDay(input.now), -(retention - 1));
  const from = [utcDay(input.lastSyncAt), input.startDate].sort().at(-1)!;
  const gaps: SyncGap[] = [];
  for (const structureId of input.structureIds) {
    const oldest = input.oldestEsiDate[structureId];
    const held = oldest !== undefined && oldest < horizon ? oldest : horizon;
    const to = shiftDate(held, -1);
    if (from <= to) gaps.push({ structureId, from, to });
  }
  return gaps;
}

export function mergeGaps(prior: readonly SyncGap[], fresh: readonly SyncGap[]): SyncGap[] {
  const byStructure = new Map<number, SyncGap[]>();
  for (const gap of [...prior, ...fresh]) {
    byStructure.set(gap.structureId, [...(byStructure.get(gap.structureId) ?? []), gap]);
  }
  const merged: SyncGap[] = [];
  for (const [structureId, gaps] of byStructure) {
    const sorted = [...gaps].sort((a, b) => a.from.localeCompare(b.from));
    let open: SyncGap | undefined;
    for (const gap of sorted) {
      if (open && gap.from <= shiftDate(open.to, 1)) {
        if (gap.to > open.to) open = { ...open, to: gap.to };
        merged[merged.length - 1] = open;
      } else {
        open = { structureId, from: gap.from, to: gap.to };
        merged.push(open);
      }
    }
  }
  return merged
    .sort((a, b) => a.from.localeCompare(b.from) || a.structureId - b.structureId)
    .slice(-MAX_GAPS);
}

export interface LastSync {
  at: number;
  byCharacterId: number;
  byName: string;
  scheduled?: boolean;
  gaps: SyncGap[];
}

export type SyncStatus =
  | { kind: 'never' }
  | {
      kind: 'fresh' | 'stale';
      at: number;
      ageMs: number;
      byCharacterId: number;
      byName: string;
      scheduled: boolean;
      gaps: SyncGap[];
    };

export function syncStatus(lastSync: LastSync | null | undefined, now: number): SyncStatus {
  if (!lastSync) return { kind: 'never' };
  const ageMs = Math.max(0, now - lastSync.at);
  return {
    kind: ageMs > STALE_AFTER_DAYS * DAY_MS ? 'stale' : 'fresh',
    at: lastSync.at,
    ageMs,
    byCharacterId: lastSync.byCharacterId,
    byName: lastSync.byName,
    scheduled: lastSync.scheduled === true,
    gaps: lastSync.gaps ?? [],
  };
}

export interface JournalEntryLike {
  id: number;
  date: string;
  ref_type: string;
  amount?: number;
  first_party_id?: number;
  second_party_id?: number;
  reason?: string;
}

export interface JournalDonation {
  refId: number;
  division: number;
  characterId: number;
  amount: number;
  at: string;
  reason?: string;
  minerId?: string;
  reviewReason?: 'no-open-balance';
}

export function donationsFromJournal(
  entries: readonly JournalEntryLike[],
  division: number,
  corporationId: number
): JournalDonation[] {
  const out: JournalDonation[] = [];
  for (const e of entries) {
    if (e.ref_type !== 'player_donation') continue;
    if (!(typeof e.amount === 'number' && e.amount > 0)) continue;
    if (e.first_party_id === undefined || e.first_party_id === corporationId) continue;
    if (!Number.isSafeInteger(e.id) || Number.isNaN(Date.parse(e.date))) continue;
    out.push({
      refId: e.id,
      division,
      characterId: e.first_party_id,
      amount: e.amount,
      at: new Date(e.date).toISOString(),
      ...(e.reason ? { reason: e.reason } : {}),
    });
  }
  return out;
}

export function donationMatchBook(book: {
  miners: readonly Miner[];
  notices: readonly Pick<LateNotice, 'id' | 'minerId' | 'code'>[];
  minedCharacterIds: ReadonlySet<number>;
  payments: readonly { characterId: number; minerId?: string }[];
}): MatchBook {
  const paidBefore = new Map<number, string[]>();
  for (const p of book.payments)
    if (p.minerId !== undefined && !paidBefore.get(p.characterId)?.includes(p.minerId))
      paidBefore.set(p.characterId, [...(paidBefore.get(p.characterId) ?? []), p.minerId]);
  return matchBookOf({
    miners: book.miners,
    notices: book.notices,
    minedCharacterIds: book.minedCharacterIds,
    recordedMinerIds: [...book.notices.map((n) => n.minerId), ...[...paidBefore.values()].flat()],
    paidBefore,
  });
}

export type SettlePayment = Omit<TaxPayment, 'minerId'> & { minerId?: string };

export interface SyncExtraction {
  structureId: number;
  moonId: number;
  extractionStartTime: string;
  chunkArrivalTime: string;
  naturalDecayTime: string;
  laserFiredAt?: string;
  cancelledAt?: string;
  oreLines?: { typeId: number; quantity: number }[];
  surveyId?: string;
  surveyScan?: SurveyScanSnapshot;
  fullyMined?: { by: number; byName: string; at: string };
  sourceCorporationId?: number;
}

export const extractionId = (x: Pick<SyncExtraction, 'structureId' | 'extractionStartTime'>) =>
  `${x.structureId}_${Date.parse(x.extractionStartTime)}`;

export function toEngineExtraction(x: SyncExtraction): Extraction {
  return {
    id: extractionId(x),
    structureId: x.structureId,
    moonId: x.moonId,
    startedAt: x.extractionStartTime,
    chunkArrivalAt: x.chunkArrivalTime,
    naturalDecayAt: x.naturalDecayTime,
    ...(x.laserFiredAt ? { laserFiredAt: x.laserFiredAt } : {}),
    ...(x.cancelledAt ? { cancelledAt: x.cancelledAt } : {}),
  };
}

export function moonOnDay(
  extractions: readonly Extraction[],
  structureId: number | undefined,
  date: string,
  expiryHours: Readonly<Record<string, number>> = {}
): { moonId?: number; extractionId?: string } {
  for (const ex of extractions) {
    if (ex.structureId !== structureId) continue;
    const status = extractionStatus(ex, `${date}T23:59:59Z`, {
      expiryHours: expiryHours[String(structureId)],
    });
    if (
      status.fracturedAt &&
      date >= status.fracturedAt.slice(0, 10) &&
      date <= status.expiresAt!.slice(0, 10)
    ) {
      return { moonId: ex.moonId, extractionId: ex.id };
    }
  }
  return {};
}

export function placeObservedRows(
  rows: readonly ObservedRow[],
  extractions: readonly SyncExtraction[],
  systemOfStructure: Readonly<Record<number, number | undefined>>
): ObservedRow[] {
  const engine = extractions.map(toEngineExtraction);
  return rows.map((row) => {
    const solarSystemId = row.solarSystemId ?? systemOfStructure[row.structureId];
    const moonId = row.moonId ?? moonOnDay(engine, row.structureId, row.date).moonId;
    return {
      ...row,
      ...(solarSystemId !== undefined ? { solarSystemId } : {}),
      ...(moonId !== undefined ? { moonId } : {}),
    };
  });
}

export function stampExtractionIds(
  rows: readonly ObservedRow[],
  extractions: readonly SyncExtraction[],
  expiryHours: Readonly<Record<string, number>> = {}
): ObservedRow[] {
  const engine = extractions.map(toEngineExtraction);
  return rows.map((row) => {
    if (row.extractionId !== undefined) return row;
    const id = moonOnDay(engine, row.structureId, row.date, expiryHours).extractionId;
    return id === undefined ? row : { ...row, extractionId: id };
  });
}

export function restampPlan(
  rows: readonly ObservedRow[],
  extractions: readonly SyncExtraction[],
  expiryHours: Readonly<Record<string, number>> = {}
): { row: ObservedRow; extractionId: string | undefined }[] {
  const engine = extractions.map(toEngineExtraction);
  return rows.flatMap((row) => {
    const id = moonOnDay(engine, row.structureId, row.date, expiryHours).extractionId;
    return id === row.extractionId ? [] : [{ row, extractionId: id }];
  });
}

export { billableStoredRows, minedSinceStart, storedRowsWanted };

export interface EsiExtractionLike {
  structure_id: number;
  moon_id: number;
  extraction_start_time: string;
  chunk_arrival_time: string;
  natural_decay_time: string;
}

export interface MoonNotification {
  type: string;
  timestamp: string;
  payload: EveNotificationPayload;
}

export type StoredExtractionKey = Pick<
  SyncExtraction,
  'structureId' | 'moonId' | 'extractionStartTime' | 'chunkArrivalTime'
> &
  Partial<Pick<SyncExtraction, 'naturalDecayTime' | 'oreLines'>>;

const SAME_CHUNK_MS = 10 * MINUTE_MS;
const WINDOW_SLACK_MS = 5 * MINUTE_MS;
const iso = (ms: number) => new Date(ms).toISOString();

const ORE_AFTER_ARRIVAL: ReadonlySet<string> = new Set([
  'MoonminingExtractionFinished',
  'MoonminingLaserFired',
  'MoonminingAutomaticFracture',
]);

function namesChunk(n: MoonNotification, arrival: number, decay: number): boolean {
  const at = Date.parse(n.timestamp);
  if (n.type === 'MoonminingExtractionFinished') {
    const auto = n.payload.autoTimeMs;
    return auto !== undefined
      ? Math.abs(auto - decay) <= SAME_CHUNK_MS
      : Math.abs(at - arrival) <= SAME_CHUNK_MS;
  }
  return at >= arrival - WINDOW_SLACK_MS && at <= decay + WINDOW_SLACK_MS;
}

const unitsOf = (volumes: readonly { typeId: number; volumeM3: number }[]) =>
  volumes.map((o) => ({
    typeId: o.typeId,
    quantity: Math.floor(o.volumeM3 / MOON_ORE_M3_PER_UNIT),
  }));

export function reconcileExtractions(
  esi: readonly EsiExtractionLike[],
  notifications: readonly MoonNotification[],
  stored: readonly StoredExtractionKey[]
): SyncExtraction[] {
  const startedNotes = notifications.filter(
    (n) =>
      n.type === 'MoonminingExtractionStarted' &&
      n.payload.structureId !== undefined &&
      n.payload.moonId !== undefined
  );
  const base: SyncExtraction[] = esi.map((x) => ({
    structureId: x.structure_id,
    moonId: x.moon_id,
    extractionStartTime: iso(Date.parse(x.extraction_start_time)),
    chunkArrivalTime: iso(Date.parse(x.chunk_arrival_time)),
    naturalDecayTime: iso(Date.parse(x.natural_decay_time)),
  }));
  const sameChunk = (
    a: { structureId: number; moonId: number; chunkArrivalTime: string },
    structureId: number,
    moonId: number,
    arrivalMs: number
  ) =>
    a.structureId === structureId &&
    a.moonId === moonId &&
    Math.abs(Date.parse(a.chunkArrivalTime) - arrivalMs) <= SAME_CHUNK_MS;

  for (const n of startedNotes) {
    const { structureId, moonId, readyTimeMs, autoTimeMs } = n.payload;
    if (readyTimeMs === undefined || autoTimeMs === undefined) continue;
    if (base.some((b) => sameChunk(b, structureId!, moonId!, readyTimeMs))) continue;
    base.push({
      structureId: structureId!,
      moonId: moonId!,
      extractionStartTime: iso(Date.parse(n.timestamp)),
      chunkArrivalTime: iso(readyTimeMs),
      naturalDecayTime: iso(autoTimeMs),
    });
  }

  const namesOre = (n: MoonNotification, x: StoredExtractionKey, decay: number) =>
    ORE_AFTER_ARRIVAL.has(n.type) &&
    n.payload.structureId === x.structureId &&
    n.payload.moonId === x.moonId &&
    !!n.payload.oreVolumes?.length &&
    namesChunk(n, Date.parse(x.chunkArrivalTime), decay);
  for (const x of stored) {
    if (x.oreLines?.length || x.naturalDecayTime === undefined) continue;
    if (base.some((b) => sameChunk(b, x.structureId, x.moonId, Date.parse(x.chunkArrivalTime))))
      continue;
    const decay = Date.parse(x.naturalDecayTime);
    if (!notifications.some((n) => namesOre(n, x, decay))) continue;
    base.push({
      structureId: x.structureId,
      moonId: x.moonId,
      extractionStartTime: x.extractionStartTime,
      chunkArrivalTime: x.chunkArrivalTime,
      naturalDecayTime: x.naturalDecayTime,
    });
  }

  return base
    .map((x): SyncExtraction => {
      const keep = stored.find((s) =>
        sameChunk(s, x.structureId, x.moonId, Date.parse(x.chunkArrivalTime))
      );
      const out: SyncExtraction = keep
        ? { ...x, extractionStartTime: keep.extractionStartTime }
        : x;
      const arrival = Date.parse(out.chunkArrivalTime);
      const start = Date.parse(out.extractionStartTime);
      const decay = Date.parse(out.naturalDecayTime);
      let oreHeld = (keep?.oreLines?.length ?? 0) > 0;
      for (const n of notifications) {
        if (n.payload.structureId !== out.structureId || n.payload.moonId !== out.moonId) continue;
        const at = Date.parse(n.timestamp);
        if (n.type === 'MoonminingExtractionStarted') {
          const { readyTimeMs, oreVolumes } = n.payload;
          if (readyTimeMs === undefined || Math.abs(readyTimeMs - arrival) > SAME_CHUNK_MS)
            continue;
          if (oreVolumes?.length) {
            out.oreLines = unitsOf(oreVolumes);
            oreHeld = true;
          }
          continue;
        }
        if (n.type === 'MoonminingLaserFired') {
          if (at >= arrival - WINDOW_SLACK_MS && at <= decay + WINDOW_SLACK_MS) {
            out.laserFiredAt = iso(at);
          }
        } else if (n.type === 'MoonminingExtractionCancelled') {
          if (at >= start - WINDOW_SLACK_MS && at <= arrival) out.cancelledAt = iso(at);
        }
        if (!oreHeld && namesOre(n, out, decay)) out.oreLines = unitsOf(n.payload.oreVolumes!);
      }
      return out;
    })
    .sort(
      (a, b) =>
        a.structureId - b.structureId || a.extractionStartTime.localeCompare(b.extractionStartTime)
    );
}
