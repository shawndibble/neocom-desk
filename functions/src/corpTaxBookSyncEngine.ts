import { utcDay } from './timeConstants.js';
import {
  moonOnDay,
  shiftDate,
  type MirrorExtraction,
  type ObservedRow,
} from './corpTaxBookEngine.js';

import { UNCOUNTED_LIMIT, minerIdFor, type UncountedDonation } from './corpTaxBookDonationMatch.js';

export { UNCOUNTED_LIMIT, minerIdFor, type UncountedDonation };

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

export const ESI_LEDGER_RETENTION_DAYS = 30;
export const MAX_GAPS = 20;

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

export interface MinerLike {
  id: string;
  characterIds: number[];
}

export const WALLET_DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export function otherDivisions(divisions: readonly number[]): number[] {
  return WALLET_DIVISIONS.filter((d) => !divisions.includes(d));
}

const EVE_EPOCH_OFFSET_MS = 11_644_473_600_000;
const TICKS_PER_MS = 10_000;

export interface MoonPayload {
  structureId?: number;
  moonId?: number;
  readyTimeMs?: number;
  autoTimeMs?: number;
  oreVolumes?: readonly { typeId: number; volumeM3: number }[];
}

function unquote(value: string): string {
  const quoted =
    value.length >= 2 &&
    (value.startsWith('"') || value.startsWith("'")) &&
    value.endsWith(value[0]);
  return quoted ? value.slice(1, -1) : value;
}

function scalarLines(text: string): Map<string, string> {
  const fields = new Map<string, string>();
  if (typeof text !== 'string') return fields;
  for (const line of text.split('\n')) {
    if (line.length === 0 || line.startsWith(' ') || line.startsWith('\t')) continue;
    if (line.startsWith('-')) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    if (key.length === 0) continue;
    let value = line
      .slice(colon + 1)
      .trim()
      .replace(/\r$/, '');
    if (value.startsWith('&')) {
      const space = value.indexOf(' ');
      value = space === -1 ? '' : value.slice(space + 1).trim();
    }
    if (value.startsWith('*')) continue;
    value = unquote(value);
    if (value.length === 0) continue;
    fields.set(key, value);
  }
  return fields;
}

function num(fields: Map<string, string>, key: string): number | undefined {
  const raw = fields.get(key);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function splitPair(text: string): [string, string] | null {
  const colon = text.indexOf(':');
  return colon <= 0 ? null : [text.slice(0, colon), text.slice(colon + 1)];
}

function oreVolumePair(rawKey: string, rawValue: string) {
  const key = rawKey.trim();
  const value = rawValue.trim();
  if (!/^\d+$/.test(key) || value.length === 0) return null;
  const typeId = Number(key);
  const volumeM3 = Number(value);
  if (!Number.isSafeInteger(typeId) || typeId <= 0) return null;
  if (!Number.isFinite(volumeM3) || volumeM3 <= 0) return null;
  return { typeId, volumeM3 };
}

function oreVolumes(text: string) {
  if (typeof text !== 'string') return undefined;
  const byType = new Map<number, number>();
  const add = (pair: [string, string] | null) => {
    const ore = pair === null ? null : oreVolumePair(pair[0], pair[1]);
    if (ore !== null) byType.set(ore.typeId, ore.volumeM3);
  };
  const lines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  for (let i = 0; i < lines.length; i++) {
    const header = splitPair(lines[i]);
    if (header === null || header[0].trim().toLowerCase() !== 'orevolumebytype') continue;
    if (/^\s/.test(lines[i])) continue;
    const inline = header[1].trim().replace(/^&\S+\s*/, '');
    if (inline.startsWith('{') && inline.endsWith('}')) {
      for (const entry of inline.slice(1, -1).split(',')) add(splitPair(entry));
      continue;
    }
    if (inline.length > 0) continue;
    let indent: string | null = null;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim().length === 0) continue;
      const leading = /^[ \t]*/.exec(line)?.[0] ?? '';
      if (leading.length === 0) break;
      indent ??= leading;
      if (leading !== indent) continue;
      add(splitPair(line));
    }
  }
  if (byType.size === 0) return undefined;
  return [...byType].map(([typeId, volumeM3]) => ({ typeId, volumeM3 }));
}

function ticksToEpochMs(ticks: number | undefined): number | undefined {
  if (ticks === undefined || ticks <= 0) return undefined;
  return Math.round(ticks / TICKS_PER_MS - EVE_EPOCH_OFFSET_MS);
}

export function parseMoonPayload(text: string): MoonPayload {
  const fields = scalarLines(text);
  return {
    structureId: num(fields, 'structureid'),
    moonId: num(fields, 'moonid'),
    readyTimeMs: ticksToEpochMs(num(fields, 'readytime')),
    autoTimeMs: ticksToEpochMs(num(fields, 'autotime')),
    oreVolumes: oreVolumes(text),
  };
}

export const MOON_NOTIFICATION_TYPES = [
  'MoonminingExtractionStarted',
  'MoonminingExtractionFinished',
  'MoonminingLaserFired',
  'MoonminingAutomaticFracture',
  'MoonminingExtractionCancelled',
] as const;

export const SCHEDULED_STOP_REASONS = [
  'role-lost',
  'left-corp',
  'token-revoked',
  'esi-refused',
  'book-off',
  'grant-unreadable',
] as const;

export const MOON_ORE_M3_PER_UNIT = 10;

export interface SyncExtraction extends MirrorExtraction {
  oreLines?: { typeId: number; quantity: number }[];
  surveyId?: string;
  sourceCorporationId?: number;
}

export type FeederExtraction = SyncExtraction & { sourceCorporationId: number };

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
  payload: MoonPayload;
}

export function moonNotificationsOf(
  feed: readonly { type: string; timestamp: string; text?: string }[]
): MoonNotification[] {
  const kinds: readonly string[] = MOON_NOTIFICATION_TYPES;
  return feed
    .filter((n) => kinds.includes(n.type) && typeof n.text === 'string')
    .map((n) => ({ type: n.type, timestamp: n.timestamp, payload: parseMoonPayload(n.text!) }));
}

export type StoredExtractionKey = Pick<
  SyncExtraction,
  'structureId' | 'moonId' | 'extractionStartTime' | 'chunkArrivalTime'
> &
  Partial<Pick<SyncExtraction, 'naturalDecayTime' | 'oreLines'>>;

const SAME_CHUNK_MS = 10 * 60_000;
const WINDOW_SLACK_MS = 5 * 60_000;
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
          const { readyTimeMs, oreVolumes: volumes } = n.payload;
          if (readyTimeMs === undefined || Math.abs(readyTimeMs - arrival) > SAME_CHUNK_MS)
            continue;
          if (volumes?.length) {
            out.oreLines = unitsOf(volumes);
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

export function placeObservedRows(
  rows: readonly ObservedRow[],
  extractions: readonly MirrorExtraction[],
  systemOfStructure: Readonly<Record<number, number | undefined>>
): ObservedRow[] {
  return rows.map((row) => {
    const solarSystemId = row.solarSystemId ?? systemOfStructure[row.structureId];
    const moonId = row.moonId ?? moonOnDay(extractions, {}, row.structureId, row.date).moonId;
    return {
      ...row,
      ...(solarSystemId !== undefined ? { solarSystemId } : {}),
      ...(moonId !== undefined ? { moonId } : {}),
    };
  });
}

export function stampExtractionIds(
  rows: readonly ObservedRow[],
  extractions: readonly MirrorExtraction[],
  expiryHours: Readonly<Record<string, number>> = {}
): ObservedRow[] {
  return rows.map((row) => {
    if (row.extractionId !== undefined) return row;
    const id = moonOnDay(extractions, expiryHours, row.structureId, row.date).extractionId;
    return id === undefined ? row : { ...row, extractionId: id };
  });
}

export function restampPlan(
  rows: readonly ObservedRow[],
  extractions: readonly MirrorExtraction[],
  expiryHours: Readonly<Record<string, number>> = {}
): { row: ObservedRow; extractionId: string | undefined }[] {
  return rows.flatMap((row) => {
    const id = moonOnDay(extractions, expiryHours, row.structureId, row.date).extractionId;
    return id === row.extractionId ? [] : [{ row, extractionId: id }];
  });
}

export interface SettlePayment {
  id: string;
  minerId?: string;
  amount: number;
  at: string;
  notTaxAmount?: number;
  source?: 'donation' | 'manual';
  reviewReason?: 'no-open-balance';
}
