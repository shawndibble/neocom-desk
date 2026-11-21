// The slice of the Corp Tax Book sync engine (src/engine/corpTaxBook/sync.ts,
// allocation.ts's `matchDonation`, src/engine/eveNotificationPayload.ts) that
// the scheduled server sync runs (issue #4068, ADR 0025). `functions/` cannot
// import `src/`, so — like corpTaxBookEngine.ts — this is a mirror kept honest
// by a parity test in the root suite (src/engine/corpTaxBook/syncMirror.test.ts)
// that runs both copies on the same inputs. Change the engine first, then this
// file. Dependency-free apart from its sibling mirror, so that test can import it.

import {
  allocatePayments,
  creditedLines,
  dismissalCredits,
  heldByStatement,
  isDayCovered,
  type CoveragePeriod,
  type HoldingDispute,
  moonOnDay,
  shiftDate,
  type AllocWriteOff,
  type MirrorDismissal,
  type MirrorExtraction,
  type ObservedRow,
} from './corpTaxBookEngine.js';

import { UNCOUNTED_LIMIT, minerIdFor, type UncountedDonation } from './corpTaxBookDonationMatch.js';

/** One copy each, in the shared donation matching (corpTaxBookDonationMatch.ts). */
export { UNCOUNTED_LIMIT, minerIdFor, type UncountedDonation };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// --- Observer ledger ------------------------------------------------------

export interface LedgerRowLike {
  character_id: number;
  recorded_corporation_id: number;
  type_id: number;
  quantity: number;
  last_updated: string;
}

/** Engine `observedRowsFromLedger`. */
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

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Engine `detectGaps`. */
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

/** Engine `mergeGaps`. */
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
  statementId?: string;
  /** Set when a known sender's Miner owed nothing, so it stays Unmatched for review (#6207). */
  reviewReason?: 'no-open-balance';
}

/** Engine `donationsFromJournal`. */
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

export interface StatementLike {
  id: string;
  minerId: string;
  code: string;
}

export type DonationMatch =
  | { kind: 'statement'; statementId: string; minerId: string }
  | { kind: 'miner'; minerId: string }
  | { kind: 'unmatched' };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function carriesCode(reason: string, code: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(code)}($|[^a-z0-9])`, 'i').test(reason);
}

/**
 * Engine `matchDonation`.
 * @deprecated The server matches with corpTaxBookDonationMatch.ts; this stays only for the
 * client's parity test (syncMirror.test.ts) and goes with the client's own copy.
 */
export function matchDonation(
  donation: { characterId: number; reason: string | undefined },
  book: {
    miners: readonly MinerLike[];
    statements: readonly StatementLike[];
    knownCharacterIds: ReadonlySet<number>;
    openBalance: ReadonlyMap<string, number>;
    unbilled: ReadonlySet<string>;
  }
): DonationMatch {
  const reason = donation.reason ?? '';
  if (reason) {
    const pinned = book.statements.find((s) => carriesCode(reason, s.code));
    if (pinned) return { kind: 'statement', statementId: pinned.id, minerId: pinned.minerId };
  }
  const grouped = book.miners.some((m) => m.characterIds.includes(donation.characterId));
  if (grouped || book.knownCharacterIds.has(donation.characterId)) {
    const minerId = minerIdFor(donation.characterId, book.miners);
    return { kind: 'miner', minerId };
  }
  return { kind: 'unmatched' };
}

/** Engine `resolveDonations`. @deprecated As `matchDonation`: the server uses `resolveDonationOwners`. */
export function resolveDonations(
  donations: readonly JournalDonation[],
  book: {
    miners: readonly MinerLike[];
    statements: readonly StatementLike[];
    knownCharacterIds: ReadonlySet<number>;
    openBalance: ReadonlyMap<string, number>;
    unbilled: ReadonlySet<string>;
  }
): JournalDonation[] {
  const balance = new Map(book.openBalance);
  const resolved = new Map<JournalDonation, JournalDonation>();
  const oldestFirst = [...donations].sort(
    (a, b) => a.at.localeCompare(b.at) || a.division - b.division || a.refId - b.refId
  );
  for (const d of oldestFirst) {
    const match = matchDonation(
      { characterId: d.characterId, reason: d.reason },
      { ...book, openBalance: balance }
    );
    if (match.kind === 'statement' || match.kind === 'miner')
      balance.set(match.minerId, (balance.get(match.minerId) ?? 0) - d.amount);
    resolved.set(
      d,
      match.kind === 'statement'
        ? { ...d, minerId: match.minerId, statementId: match.statementId }
        : match.kind === 'miner'
          ? { ...d, minerId: match.minerId }
          : d
    );
  }
  return donations.map((d) => resolved.get(d)!);
}

// --- Donations into divisions the book does not read (#6207) --------------

/** Engine `WALLET_DIVISIONS`. */
export const WALLET_DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Engine `otherDivisions`. */
export function otherDivisions(divisions: readonly number[]): number[] {
  return WALLET_DIVISIONS.filter((d) => !divisions.includes(d));
}

/** Engine `noteUncounted`. @deprecated As `matchDonation`: the server uses `uncountedDonations`. */
export function noteUncounted(
  donations: readonly JournalDonation[],
  book: {
    miners: readonly MinerLike[];
    statements: readonly StatementLike[];
    knownCharacterIds: ReadonlySet<number>;
    openBalance: ReadonlyMap<string, number>;
    unbilled: ReadonlySet<string>;
  },
  counted: readonly JournalDonation[] = []
): UncountedDonation[] {
  const openBalance = new Map(book.openBalance);
  for (const c of counted)
    if (c.minerId !== undefined)
      openBalance.set(c.minerId, (openBalance.get(c.minerId) ?? 0) - c.amount);
  return donations
    .filter((d) => {
      const match = matchDonation({ characterId: d.characterId, reason: d.reason }, book);
      if (match.kind === 'statement') return true;
      // A known sender's donation here is likely tax only while their Miner owes (#6207).
      return (
        match.kind === 'miner' &&
        ((openBalance.get(match.minerId) ?? 0) > 0 || book.unbilled.has(match.minerId))
      );
    })
    .sort((a, b) => b.at.localeCompare(a.at) || b.refId - a.refId)
    .slice(0, UNCOUNTED_LIMIT)
    .map((d) => ({
      id: `j${d.division}_${d.refId}`,
      refId: d.refId,
      division: d.division,
      characterId: d.characterId,
      amount: d.amount,
      at: d.at,
    }));
}

// --- Notification payloads ------------------------------------------------

const EVE_EPOCH_OFFSET_MS = 11_644_473_600_000;
const TICKS_PER_MS = 10_000;

/** The fields of a moon drill notification the sync reads (engine `EveNotificationPayload`). */
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

/** The moon-related fields of engine `parseEveNotificationPayload`. Never throws. */
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

// --- Extractions ----------------------------------------------------------

/** The moon drill notification types the sync reads (client: `MOON_NOTIFICATION_TYPES` in sync.ts). */
export const MOON_NOTIFICATION_TYPES = [
  'MoonminingExtractionStarted',
  'MoonminingLaserFired',
  'MoonminingExtractionCancelled',
] as const;

/** Why a schedule can stop (client: `SCHEDULED_STOP_REASONS` in scheduledSync.ts). */
export const SCHEDULED_STOP_REASONS = [
  'role-lost',
  'left-corp',
  'token-revoked',
  'esi-refused',
  'book-off',
  'grant-unreadable',
] as const;

/** Moon ore is 10 m³ a unit (engine `MOON_ORE_M3_PER_UNIT`). */
export const MOON_ORE_M3_PER_UNIT = 10;

export interface SyncExtraction extends MirrorExtraction {
  oreLines?: { typeId: number; quantity: number }[];
  surveyId?: string;
  /** The moon owner whose grant read it (#6097); absent means the book's own corporation. */
  sourceCorporationId?: number;
}

/** A moon owner's Extraction, as its grant read it (#6097). */
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

/** The moon drill notifications in a character's feed, parsed; every other type is left out. */
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
>;

const SAME_CHUNK_MS = 10 * 60_000;
const WINDOW_SLACK_MS = 5 * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

/** Engine `reconcileExtractions`. */
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
      for (const n of notifications) {
        if (n.payload.structureId !== out.structureId || n.payload.moonId !== out.moonId) continue;
        const at = Date.parse(n.timestamp);
        if (n.type === 'MoonminingExtractionStarted') {
          const { readyTimeMs, oreVolumes: volumes } = n.payload;
          if (readyTimeMs === undefined || Math.abs(readyTimeMs - arrival) > SAME_CHUNK_MS)
            continue;
          if (volumes?.length) {
            out.oreLines = volumes.map((o) => ({
              typeId: o.typeId,
              quantity: Math.floor(o.volumeM3 / MOON_ORE_M3_PER_UNIT),
            }));
          }
        } else if (n.type === 'MoonminingLaserFired') {
          if (at >= arrival - WINDOW_SLACK_MS && at <= decay + WINDOW_SLACK_MS) {
            out.laserFiredAt = iso(at);
          }
        } else if (n.type === 'MoonminingExtractionCancelled') {
          if (at >= start - WINDOW_SLACK_MS && at <= arrival) out.cancelledAt = iso(at);
        }
      }
      return out;
    })
    .sort(
      (a, b) =>
        a.structureId - b.structureId || a.extractionStartTime.localeCompare(b.extractionStartTime)
    );
}

/** Engine `placeObservedRows`: the refinery's system and that day's moon, omitted when unknown. */
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

/** Engine `stampExtractionIds`: the pull covering each unstamped row's day, per-structure expiry. */
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

/** Engine `restampPlan`: the rows whose stamp the current Extractions no longer give. */
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

// --- Settlement -----------------------------------------------------------

export interface SettleStatement {
  id: string;
  minerId: string;
  amount: number;
  issuedAt: string;
  /** A running account's late notice (#6294): never settled, never an open balance. */
  kind?: string;
  lines: {
    chargeKey?: string;
    date?: string;
    tax?: number;
    structureId?: number;
    /** Read by `heldByStatement` to price a disputed line as it was billed. */
    kind?: string;
    oreLines?: { typeId: number; quantity: number }[];
    unitPrices?: Record<string, number>;
    taxPct?: number;
  }[];
}

export interface SettlePayment {
  id: string;
  minerId?: string;
  amount: number;
  at: string;
  statementId?: string;
  notTaxAmount?: number;
  source?: 'donation' | 'manual';
  /** Held for an officer's review (#6207): never re-matched by a sync. */
  reviewReason?: 'no-open-balance';
}

interface SettleInput {
  statements: readonly SettleStatement[];
  payments: readonly SettlePayment[];
  dismissals: readonly MirrorDismissal[];
  alreadyPaid: ReadonlySet<string>;
  extractions: readonly MirrorExtraction[];
  /** Officer write-offs (#4637): a Statement one forgives in full is settled. */
  writeOffs?: readonly (AllocWriteOff & { minerId: string })[];
  startDate?: string;
  /** Engine `SettleInput.disputes`: with `now`, an open one holds its amount out of what is due. */
  disputes?: readonly (HoldingDispute & { minerId: string })[];
  now?: string;
}

/** Engine `planSettlements`: the Statements now settled that the book does not yet hold as paid. */
export function planSettlements(input: SettleInput): string[] {
  const settled: string[] = [];
  for (const { statements, allocation } of allocateEachMiner(input)) {
    for (const s of statements) {
      const st = allocation.byStatement.get(s.id);
      // Settled only because a dispute holds part of it: not for good (D22).
      if (st?.settled && !st.held && !input.alreadyPaid.has(s.id)) {
        settled.push(s.id);
      }
    }
  }
  return settled;
}

/** Engine `billsDays`: a running account's late notice (#6294) bills no days of its own. */
export const billsDays = (s: { kind?: string }): boolean => s.kind !== 'notice';

/** Engine `unbilledMinerIds`. */
export function unbilledMinerIds(
  rows: readonly { characterId: number; date: string; quantity: number }[],
  book: {
    miners: readonly MinerLike[];
    statements: readonly { minerId: string; coversThrough?: string; kind?: string }[];
    startDate: string;
  }
): Set<string> {
  const billedThrough = new Map<string, string>();
  for (const s of book.statements.filter(billsDays))
    if (s.coversThrough && s.coversThrough > (billedThrough.get(s.minerId) ?? ''))
      billedThrough.set(s.minerId, s.coversThrough);
  const out = new Set<string>();
  for (const r of rows) {
    if (!(r.quantity > 0) || r.date < book.startDate) continue;
    const minerId = minerIdFor(r.characterId, book.miners);
    if (r.date > (billedThrough.get(minerId) ?? '')) out.add(minerId);
  }
  return out;
}

/**
 * Engine `unbilledWhenPaid`.
 * Whether a held donation's Miner had ore not yet on a Statement when they paid: a ledger row
 * dated on or before the payment's UTC day, after everything the Statements issued by then
 * covered. The ESI ledger lags the mining by about an hour, so a Miner who pays straight after
 * mining is held for review (`no-open-balance`) though they owed; a later sync that finds such a
 * row matches the donation as the first sync would have, had the ledger been current.
 */
export function unbilledWhenPaid(
  payment: { characterId: number; at: string },
  rows: readonly { characterId: number; date: string; quantity: number }[],
  book: {
    miners: readonly MinerLike[];
    statements: readonly {
      minerId: string;
      coversThrough?: string;
      issuedAt?: string;
      kind?: string;
    }[];
    startDate: string;
  }
): boolean {
  const minerId = minerIdFor(payment.characterId, book.miners);
  const paidDay = payment.at.slice(0, 10);
  const billedThrough = billedThroughWhenPaid(payment, book);
  return rows.some(
    (r) =>
      r.quantity > 0 &&
      r.date >= book.startDate &&
      r.date <= paidDay &&
      r.date > billedThrough &&
      minerIdFor(r.characterId, book.miners) === minerId
  );
}

function billedThroughWhenPaid(
  payment: { characterId: number; at: string },
  book: {
    miners: readonly MinerLike[];
    statements: readonly {
      minerId: string;
      coversThrough?: string;
      issuedAt?: string;
      kind?: string;
    }[];
  }
): string {
  const minerId = minerIdFor(payment.characterId, book.miners);
  let billedThrough = '';
  for (const s of book.statements.filter(billsDays))
    if (
      s.minerId === minerId &&
      s.coversThrough &&
      s.issuedAt !== undefined &&
      s.issuedAt <= payment.at &&
      s.coversThrough > billedThrough
    )
      billedThrough = s.coversThrough;
  return billedThrough;
}

/**
 * Engine `storedRowsWanted`: by Character, the first day of stored rows (moon owners' mining
 * the book bills, which this run's own ledger read never holds) to match donations against.
 */
export function storedRowsWanted(input: {
  held: readonly { characterId: number; at: string }[];
  senders: readonly number[];
  miners: readonly MinerLike[];
  statements: readonly {
    minerId: string;
    coversThrough?: string;
    issuedAt?: string;
    kind?: string;
  }[];
  startDate: string;
}): Map<number, string> {
  const out = new Map<number, string>();
  const want = (characterId: number, billedThrough: string, through?: string) => {
    const after = billedThrough ? shiftDate(billedThrough, 1) : '';
    const from = after > input.startDate ? after : input.startDate;
    if (through !== undefined && from > through) return;
    const minerId = minerIdFor(characterId, input.miners);
    const characters = input.miners.find((m) => m.id === minerId)?.characterIds ?? [characterId];
    for (const c of characters) {
      const held = out.get(c);
      if (held === undefined || from < held) out.set(c, from);
    }
  };
  for (const p of input.held)
    want(p.characterId, billedThroughWhenPaid(p, input), p.at.slice(0, 10));
  for (const characterId of input.senders) {
    const minerId = minerIdFor(characterId, input.miners);
    let billedThrough = '';
    for (const s of input.statements.filter(billsDays))
      if (s.minerId === minerId && s.coversThrough && s.coversThrough > billedThrough)
        billedThrough = s.coversThrough;
    want(characterId, billedThrough);
  }
  return out;
}

/** Engine `billableStoredRows`. */
export function billableStoredRows<
  T extends { characterId: number; date: string; sourceCorporationId?: number },
>(
  rows: readonly T[],
  wanted: ReadonlyMap<number, string>,
  bookCorporationId: number,
  feeders: readonly { corporationId: number; coveragePeriods?: readonly CoveragePeriod[] }[]
): T[] {
  const periodsOf = new Map(feeders.map((f) => [f.corporationId, f.coveragePeriods]));
  return rows.filter((r) => {
    const from = wanted.get(r.characterId);
    if (from === undefined || r.date < from) return false;
    const source = r.sourceCorporationId;
    const periods =
      source === undefined || source === bookCorporationId ? undefined : periodsOf.get(source);
    return periods === undefined || isDayCovered(periods, r.date);
  });
}

/** Engine `openBalances`: what each Miner still owes on issued Statements. */
export function openBalances(input: Omit<SettleInput, 'alreadyPaid'>): Map<string, number> {
  const out = new Map<string, number>();
  for (const { minerId, allocation } of allocateEachMiner(input)) {
    let owed = 0;
    for (const s of allocation.byStatement.values()) if (!s.settled) owed += s.remaining;
    if (owed > 0) out.set(minerId, owed);
  }
  return out;
}

function allocateEachMiner(input: Omit<SettleInput, 'alreadyPaid'>) {
  const billing = input.statements.filter(billsDays);
  const minerIds = [...new Set(billing.map((s) => s.minerId))];
  return minerIds.map((minerId) => {
    const statements = billing.filter((s) => s.minerId === minerId);
    const payments = input.payments.filter((p) => p.minerId === minerId);
    const credits = dismissalCredits({
      minerId,
      statements,
      dismissals: input.dismissals,
      extractions: input.extractions,
      expiryHours: {},
    });
    const held =
      input.now !== undefined && input.disputes
        ? heldByStatement(
            statements,
            input.disputes.filter((d) => d.minerId === minerId),
            creditedLines(credits),
            input.now
          )
        : new Map<string, number>();
    const allocation = allocatePayments({
      statements,
      payments,
      dismissalCredits: credits,
      officerWriteOffs: (input.writeOffs ?? []).filter((w) => w.minerId === minerId),
      startDate: input.startDate,
      ...(held.size > 0 ? { held } : {}),
    });
    return { minerId, statements, allocation };
  });
}
