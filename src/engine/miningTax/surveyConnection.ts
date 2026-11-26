import { HOUR_MS } from '@/lib/age';
import { isDefaultAssigned, isUnpaidDefault } from './defaultSystems';
import { growthCollector, type CoveringAssignment } from './ownership';
import type { MiningLedgerEntry, OreLine } from './types';
import { utcDay } from '@/engine/localDay';

export const LEDGER_GRACE_MS = HOUR_MS;

export interface SurveyConnection {
  surveyId: string;
  characterId: number;
  payeeId: string;
  payeeName: string;
  taxPct: number;
  systemId: number | null;
  structureLabel?: string;
  typeIds: number[];
  fromDate: string;
  untilMs: number;
  expiresAt: number;
  connectedAt: number;
}

export const NO_ETA_WINDOW_MS = 12 * HOUR_MS;

export interface ConnectionWindowInput {
  firstAt: number;
  etaAt: number | null;
  finished: boolean;
  finishedAt: number | null;
  lastAt: number;
  expiresAt: number;
}

export function connectionWindow(
  input: ConnectionWindowInput,
  connectedAt: number
): {
  fromDate: string;
  untilMs: number;
} {
  const end = input.finished
    ? (input.finishedAt ?? input.lastAt)
    : (input.etaAt ?? connectedAt + NO_ETA_WINDOW_MS);
  return { fromDate: utcDay(input.firstAt), untilMs: Math.min(end, input.expiresAt) };
}

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

export function updateSurveyConnection(
  list: readonly SurveyConnection[],
  next: SurveyConnection,
  nowMs: number
): SurveyConnection[] {
  return list
    .filter((c) => isConnectionLive(c, nowMs))
    .map((c) => (sameConnection(c, next) ? next : c));
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

export function parseSurveyConnections(raw: unknown): SurveyConnection[] | null {
  return Array.isArray(raw) ? raw.filter(isConnection) : null;
}

export interface PlannedCovering extends CoveringAssignment {
  characterId: number;
  date: string;
  solarSystemId: number;
  payeeId?: string;
  taxPct: number;
  override?: boolean;
}

export interface Takeover {
  assignmentId: string;
  typeIds: number[];
}

export interface AutoAssignSlice {
  connection: SurveyConnection;
  characterId: number;
  date: string;
  solarSystemId: number;
  oreLines: OreLine[];
  label?: string;
  entryOreLines: readonly OreLine[];
  takeovers: Takeover[];
}

function covers(c: SurveyConnection, e: MiningLedgerEntry, nowMs: number): boolean {
  return (
    c.characterId === e.characterId &&
    c.systemId === e.solarSystemId &&
    c.fromDate <= e.date &&
    e.date <= utcDay(c.untilMs) &&
    isConnectionLive(c, nowMs)
  );
}

function ownerOf(
  claimants: readonly SurveyConnection[],
  nowMs: number
): SurveyConnection | undefined {
  if (claimants.length === 1) return claimants[0];
  const mining = claimants.filter((c) => nowMs <= c.untilMs);
  return mining.length === 1 ? mining[0] : undefined;
}

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

    const claimed = new Set(live.flatMap((c) => c.typeIds));
    const takeable = isUnpaidDefault;
    const held = new Map<number, number>();
    for (const a of covering) {
      for (const line of a.oreLines) {
        if (takeable(a) && claimed.has(line.typeId)) continue;
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
        !isDefaultAssigned(collector) &&
        collector.status !== 'paid' &&
        collector.payeeId === c.payeeId &&
        collector.taxPct === c.taxPct;
      if (alreadyBilling) continue;
      const typeIds = new Set(oreLines.map((l) => l.typeId));
      const takeovers = covering.filter(takeable).flatMap((a) => {
        const taken = a.oreLines.map((l) => l.typeId).filter((t) => typeIds.has(t));
        return taken.length > 0
          ? [{ assignmentId: a.id, typeIds: taken.sort((x, y) => x - y) }]
          : [];
      });
      slices.push({
        connection: c,
        characterId: e.characterId,
        date: e.date,
        solarSystemId: e.solarSystemId,
        oreLines: [...oreLines].sort((a, b) => a.typeId - b.typeId),
        ...(c.structureLabel ? { label: c.structureLabel } : {}),
        entryOreLines: e.oreLines,
        takeovers,
      });
    }
  }
  return slices;
}
