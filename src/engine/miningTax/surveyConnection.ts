/**
 * A Survey connection (issue #4684): "Assign Taxes" on a moon Survey ties
 * that moon's mining to the Survey's Payee and rate, so the pilot never
 * assigns it by hand. While the Survey is being mined — from its first scan's
 * UTC date until its ETA, plus a grace period for the ledger's lag — every
 * unassigned ore line of the Survey's moon ore types, in the Survey's system,
 * is assigned to that Payee at that rate as it reaches the Mining Ledger.
 *
 * The ledger has days, systems and ore types, never moons, so this never
 * guesses: an entry holding ore no live connection covers (another moon's
 * ore), or ore two live connections both claim while both are being mined, is
 * left for the pilot to assign. Two moons in one system are still told apart
 * by time, because only the one being mined is live (or the one still in its
 * grace period when no other is).
 *
 * Pure: the caller loads entries and Assignments and writes what this plans.
 */
import { growthCollector, type CoveringAssignment } from './ownership';
import type { MiningLedgerEntry, OreLine } from './types';

/** How long past its ETA a connection still claims ore: ESI's mining ledger runs a few minutes behind the game, sometimes more. */
export const LEDGER_GRACE_MS = 60 * 60 * 1000;

export interface SurveyConnection {
  surveyId: string;
  /** The Character whose mining is connected — the one who clicked. */
  characterId: number;
  payeeId: string;
  /** The Payee's name when connected, for the Survey's "Assigning to …" line. */
  payeeName: string;
  /** The Survey's rate, which every Assignment it makes is billed at. */
  taxPct: number;
  /** The Survey Location's solar system; null until the Survey has one that resolves. */
  systemId: number | null;
  /** The structure named in the Survey Location ("Mav's Watering Hole" from "Ainsan - Mav's Watering Hole"); the "Moon / structure" label each Assignment gets. */
  structureLabel?: string;
  /** The moon ore types the Survey's scans show. */
  typeIds: number[];
  /** UTC `YYYY-MM-DD` of the Survey's first scan. */
  fromDate: string;
  /** Epoch ms the Survey is expected to be mined out (its ETA). */
  untilMs: number;
  /** The Survey link's own expiry, epoch ms. */
  expiresAt: number;
  connectedAt: number;
}

/** The summary fields a connection's window is read from (`SurveySummary`, engine/survey/series.ts). */
export interface ConnectionWindowInput {
  firstAt: number;
  etaAt: number | null;
  finished: boolean;
  finishedAt: number | null;
  lastAt: number;
  expiresAt: number;
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * From the first scan's UTC date until the field runs out: the ETA while it is
 * being mined, the time it was found empty once finished, and the link's
 * expiry while there is no ETA yet (one scan, no pace). Never past the expiry.
 */
export function connectionWindow(input: ConnectionWindowInput): {
  fromDate: string;
  untilMs: number;
} {
  const end = input.finished
    ? (input.finishedAt ?? input.lastAt)
    : (input.etaAt ?? input.expiresAt);
  return { fromDate: utcDate(input.firstAt), untilMs: Math.min(end, input.expiresAt) };
}

/**
 * The structure in a Survey Location's name: EVE names a station or structure
 * "System - Structure", so what follows the first " - ". None for a bare
 * system or a blank name.
 */
export function structureFromLocation(name: string | undefined): string | undefined {
  const at = name?.indexOf(' - ') ?? -1;
  if (name === undefined || at < 0) return undefined;
  return name.slice(at + 3).trim() || undefined;
}

export function isConnectionLive(connection: SurveyConnection, nowMs: number): boolean {
  return nowMs <= connection.untilMs + LEDGER_GRACE_MS;
}

const sameConnection = (a: SurveyConnection, b: SurveyConnection) =>
  a.surveyId === b.surveyId && a.characterId === b.characterId;

/** Saves `next` over the same Survey's connection for the same Character, dropping any no longer live. */
export function upsertSurveyConnection(
  list: readonly SurveyConnection[],
  next: SurveyConnection,
  nowMs: number
): SurveyConnection[] {
  return [...list.filter((c) => !sameConnection(c, next) && isConnectionLive(c, nowMs)), next];
}

function isConnection(value: unknown): value is SurveyConnection {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.surveyId === 'string' &&
    typeof c.characterId === 'number' &&
    typeof c.payeeId === 'string' &&
    typeof c.payeeName === 'string' &&
    typeof c.taxPct === 'number' &&
    (c.systemId === null || typeof c.systemId === 'number') &&
    (c.structureLabel === undefined || typeof c.structureLabel === 'string') &&
    Array.isArray(c.typeIds) &&
    c.typeIds.every((id) => typeof id === 'number') &&
    typeof c.fromDate === 'string' &&
    typeof c.untilMs === 'number' &&
    typeof c.expiresAt === 'number' &&
    typeof c.connectedAt === 'number'
  );
}

/** The synced setting's value, malformed entries dropped; null when it is no list at all. */
export function parseSurveyConnections(raw: unknown): SurveyConnection[] | null {
  return Array.isArray(raw) ? raw.filter(isConnection) : null;
}

/** A stored Assignment, as far as planning reads it. */
export interface PlannedCovering extends CoveringAssignment {
  characterId: number;
  date: string;
  solarSystemId: number;
  payeeId?: string;
  taxPct: number;
}

export interface AutoAssignSlice {
  connection: SurveyConnection;
  characterId: number;
  date: string;
  solarSystemId: number;
  oreLines: OreLine[];
  /** The connection's structure, for the Assignment's "Moon / structure" label. */
  label?: string;
  /** The entry's whole ore, for the double-assignment guard. */
  entryOreLines: readonly OreLine[];
}

function covers(c: SurveyConnection, e: MiningLedgerEntry, nowMs: number): boolean {
  return (
    c.characterId === e.characterId &&
    c.systemId === e.solarSystemId &&
    c.fromDate <= e.date &&
    e.date <= utcDate(c.untilMs) &&
    isConnectionLive(c, nowMs)
  );
}

/** The one connection that owns a type: the only claimant, or the only one still being mined. */
function ownerOf(
  claimants: readonly SurveyConnection[],
  nowMs: number
): SurveyConnection | undefined {
  if (claimants.length === 1) return claimants[0];
  const mining = claimants.filter((c) => nowMs <= c.untilMs);
  return mining.length === 1 ? mining[0] : undefined;
}

/**
 * Another live connection this one shares ore with that nobody owns: same
 * Character and system, a shared ore type, and `ownerOf` finds no single owner,
 * so `planSurveyAutoAssign` leaves that ore for the pilot to assign.
 */
export function findOreClash(
  connection: SurveyConnection,
  connections: readonly SurveyConnection[],
  nowMs: number
): SurveyConnection | undefined {
  if (connection.systemId === null) return undefined;
  const sameField = connections.filter(
    (c) =>
      c.characterId === connection.characterId &&
      c.systemId === connection.systemId &&
      isConnectionLive(c, nowMs)
  );
  for (const typeId of connection.typeIds) {
    const claimants = sameField.filter((c) => c.typeIds.includes(typeId));
    if (claimants.length > 1 && ownerOf(claimants, nowMs) === undefined) {
      return claimants.find((c) => c !== connection && c.surveyId !== connection.surveyId);
    }
  }
  return undefined;
}

/**
 * The ore each live connection should assign now: per entry, what no stored
 * Assignment holds (entry quantity less every covering snapshot), grouped by
 * the connection whose ore types it is. Nothing for an entry when any of that
 * ore has no single owner, or the entry's growth collector is a dismissal (the
 * pilot said no tax here). A connection whose Payee and rate already collect
 * the entry's growth, unpaid, is left to that Assignment: it absorbs the ore
 * on its own (`reconcile.ts`), so a second row would only split one bill.
 */
export function planSurveyAutoAssign(
  entries: readonly MiningLedgerEntry[],
  assignments: readonly PlannedCovering[],
  connections: readonly SurveyConnection[],
  nowMs: number
): AutoAssignSlice[] {
  const byEntry = new Map<string, PlannedCovering[]>();
  for (const a of assignments) {
    const key = `${a.characterId}|${a.date}|${a.solarSystemId}`;
    let list = byEntry.get(key);
    if (!list) byEntry.set(key, (list = []));
    list.push(a);
  }

  const slices: AutoAssignSlice[] = [];
  for (const e of entries) {
    const live = connections.filter((c) => covers(c, e, nowMs));
    if (live.length === 0) continue;
    const covering = byEntry.get(`${e.characterId}|${e.date}|${e.solarSystemId}`) ?? [];
    const collector = growthCollector(covering);
    if (collector?.status === 'dismissed') continue;

    const held = new Map<number, number>();
    for (const a of covering) {
      for (const line of a.oreLines) {
        held.set(line.typeId, (held.get(line.typeId) ?? 0) + line.quantity);
      }
    }

    const owned = new Map<SurveyConnection, OreLine[]>();
    let ambiguous = false;
    for (const line of e.oreLines) {
      const residual = line.quantity - (held.get(line.typeId) ?? 0);
      if (residual <= 0) continue;
      const owner = ownerOf(
        live.filter((c) => c.typeIds.includes(line.typeId)),
        nowMs
      );
      if (!owner) {
        ambiguous = true;
        break;
      }
      const lines = owned.get(owner) ?? [];
      lines.push({ typeId: line.typeId, quantity: residual });
      owned.set(owner, lines);
    }
    if (ambiguous) continue;

    for (const [c, oreLines] of owned) {
      const alreadyBilling =
        collector !== undefined &&
        collector.status !== 'paid' &&
        collector.payeeId === c.payeeId &&
        collector.taxPct === c.taxPct;
      if (alreadyBilling) continue;
      slices.push({
        connection: c,
        characterId: e.characterId,
        date: e.date,
        solarSystemId: e.solarSystemId,
        oreLines: [...oreLines].sort((a, b) => a.typeId - b.typeId),
        ...(c.structureLabel ? { label: c.structureLabel } : {}),
        entryOreLines: e.oreLines,
      });
    }
  }
  return slices;
}
