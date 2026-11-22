/**
 * The pure half of the officer sync client (issue #4062, epic #4055, D9): what
 * an officer's visit uploads to the Corp Tax Book and what it concludes from
 * the book afterwards. Nothing here fetches; `features/corp/taxBook/` reads
 * ESI and Firestore and hands the results in.
 *
 * Two jobs the backend deliberately leaves to the client (#4061 hand-off):
 * resolve each donation's Miner, and report history ESI no longer holds.
 */
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

/** What ESI is assumed to keep of a refinery's ledger: the character ledger's 30 days; the corp's is unconfirmed. */
export const ESI_LEDGER_RETENTION_DAYS = 30;
/** The moon drill notification types the sync reads (the server mirrors the list; a test pins it). */
export const MOON_NOTIFICATION_TYPES = [
  'MoonminingExtractionStarted',
  'MoonminingExtractionFinished',
  'MoonminingLaserFired',
  'MoonminingAutomaticFracture',
  'MoonminingExtractionCancelled',
] as const;
/** After this long without a sync the book warns (D9). */
export const STALE_AFTER_DAYS = 3;
/** The server keeps at most this many gaps in a sync. */
export const MAX_GAPS = 20;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// --- Observer ledger ------------------------------------------------------

/** One row of `GET /corporation/{id}/mining/observers/{observer_id}`. */
export interface LedgerRowLike {
  character_id: number;
  recorded_corporation_id: number;
  type_id: number;
  quantity: number;
  last_updated: string;
}

/** The ledger as `ObservedRow`s, dropping what the callable would reject. */
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

// --- Gaps -----------------------------------------------------------------

export interface SyncGap {
  structureId: number;
  /** First lost day, inclusive. */
  from: string;
  /** Last lost day, inclusive. */
  to: string;
}

export interface GapInput {
  /** When the book was last synced by anyone; null before the first sync. */
  lastSyncAt: number | null;
  now: number;
  startDate: string;
  structureIds: readonly number[];
  /** The oldest day ESI returned per refinery this time: proof of a longer retention. */
  oldestEsiDate: Readonly<Record<number, string | undefined>>;
  retentionDays?: number;
}

/**
 * Days nobody recorded and ESI no longer lists. A sync captures a day only as
 * far as it had grown, so the day of the last sync is lost with the days after
 * it that have since aged out. With no earlier sync nothing was missed: the
 * book starts with what ESI holds.
 */
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

/** Earlier gaps stay (lost history stays lost); overlapping or touching ones join; the newest `MAX_GAPS` are kept. */
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

// --- Last synced ----------------------------------------------------------

/** `corps/{corp}.lastSync`. */
export interface LastSync {
  /** Epoch ms, server time. */
  at: number;
  byCharacterId: number;
  byName: string;
  /** Set when the scheduled server sync made this record, not an officer's visit (ADR 0025). */
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
      /** The scheduled server sync made it (ADR 0025); `byName` is then the grant holder. */
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

// --- Donations ------------------------------------------------------------

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
  /** Set when a known sender's Miner owed nothing, so it stays Unmatched for review (#6207). */
  reviewReason?: 'no-open-balance';
}

/** ISK players sent into one wallet division: `player_donation`s from someone other than the corporation. */
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

/**
 * The book as the shared donation rule reads it (`donationOwner`, functions/src/
 * corpTaxBookDonationMatch.ts): its Miners, every code it recognises, the Characters it has seen
 * mine and whom each payer paid before. The officer tab's one way into that rule, so it cannot
 * drift from the server's.
 */
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
    // The Miners the book holds a record of, as the server counts them: a notice or a payment.
    recordedMinerIds: [...book.notices.map((n) => n.minerId), ...[...paidBefore.values()].flat()],
    paidBefore,
  });
}

// --- Settlement -----------------------------------------------------------

export type SettlePayment = Omit<TaxPayment, 'minerId'> & { minerId?: string };

/** An Extraction as the book stores it (the sync callable's shape). */
export interface SyncExtraction {
  structureId: number;
  moonId: number;
  extractionStartTime: string;
  chunkArrivalTime: string;
  naturalDecayTime: string;
  laserFiredAt?: string;
  cancelledAt?: string;
  oreLines?: { typeId: number; quantity: number }[];
  /** A Moon Ore Survey (Share Link id) an officer linked as the ore source when there is no notification (D13). */
  surveyId?: string;
  /** That Survey's first scan, kept with the link so the make-up outlives the Survey's 7-day link. */
  surveyScan?: SurveyScanSnapshot;
  /** Set by an officer once the chunk is mined out (#5257); absent when not flagged. */
  fullyMined?: { by: number; byName: string; at: string };
  /** The moon owner whose grant read it (#6097); absent means the book's own corporation. */
  sourceCorporationId?: number;
}

export const extractionId = (x: Pick<SyncExtraction, 'structureId' | 'extractionStartTime'>) =>
  `${x.structureId}_${Date.parse(x.extractionStartTime)}`;

/** The engine's `Extraction` from a stored one. */
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

/**
 * The Extraction a refinery was working on a given day and its moon: from the
 * day the chunk fractured to the day its belt expired. Empty when none covers it.
 */
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

/**
 * Observer rows with the refinery's solar system and that day's moon (#4181),
 * so members, who cannot read Extractions, still line up by system and get
 * per-moon rates. A refinery with no known system or Extraction keeps its row
 * as it was: the fields are omitted, never guessed.
 */
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

/**
 * Rows with the `extractionId` of the pull covering their day, for rows that have none. Uses
 * the per-structure expiry, like read-time placement (`placeOfFactory`), so the stamp and the
 * view agree. A row no pull covers keeps no stamp; a stamped row is left as it is.
 */
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

/**
 * The rows whose stamp is not the one the current Extractions give: after an Extraction is
 * corrected (a later laser time, a cancel) or an expiry changes. `extractionId` undefined means
 * no pull covers the row any more, so its stamp is cleared.
 */
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

/** Which stored rows a sync reads to match donations: the shared rules (corpTaxBookMatchRows). */
export { billableStoredRows, minedSinceStart, storedRowsWanted };

// --- Extractions ----------------------------------------------------------

export interface EsiExtractionLike {
  structure_id: number;
  moon_id: number;
  extraction_start_time: string;
  chunk_arrival_time: string;
  natural_decay_time: string;
}

export interface MoonNotification {
  type: string;
  /** The notification's own timestamp. */
  timestamp: string;
  payload: EveNotificationPayload;
}

/** What the book already stores of an Extraction — enough to keep its identity. */
export type StoredExtractionKey = Pick<
  SyncExtraction,
  'structureId' | 'moonId' | 'extractionStartTime' | 'chunkArrivalTime'
> &
  Partial<Pick<SyncExtraction, 'naturalDecayTime' | 'oreLines'>>;

const SAME_CHUNK_MS = 10 * MINUTE_MS;
const WINDOW_SLACK_MS = 5 * MINUTE_MS;
const iso = (ms: number) => new Date(ms).toISOString();

/** The notifications sent once a chunk has arrived that also name its ore. */
const ORE_AFTER_ARRIVAL: ReadonlySet<string> = new Set([
  'MoonminingExtractionFinished',
  'MoonminingLaserFired',
  'MoonminingAutomaticFracture',
]);

/** Whether an after-arrival notification is about the chunk arriving at `arrival`, fracturing by `decay`. */
function namesChunk(n: MoonNotification, arrival: number, decay: number): boolean {
  const at = Date.parse(n.timestamp);
  if (n.type === 'MoonminingExtractionFinished') {
    // Sent as the chunk arrives; its autoTime is that chunk's own fracture time.
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

/**
 * The Extractions to upload: ESI's current ones, plus any a started
 * notification remembers that ESI no longer lists, plus a stored one ESI no
 * longer lists whose ore a later notification names, each carrying what the
 * moon notifications add (the chunk's ore, when the laser fired, a
 * cancellation). The ore is the started notification's; without it, that of
 * Extraction finished, Laser fired or Automatic fracture, which name the same
 * chunk (the started one is weeks old by then, often gone from the feed).
 * Identity is structure + start time on the server, so an
 * Extraction the book already stores keeps its stored start time even when
 * ESI and the notification disagree by seconds.
 */
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
      // Ore the book already holds (stored by an earlier sync), or the started notification's once
      // read here, is never replaced by a later notification's: they name the same chunk.
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
