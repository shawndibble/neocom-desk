/**
 * Mercenary Dens (issue #4791): how urgent a den is, the order the widget
 * lists them in, and its headline. Epoch ms in, plain values out.
 *
 * ESI's enums arrive as strings; `denState`, `operationState` and `levelNumber`
 * read them so nothing past here branches on ESI spelling.
 */
import { DAY_MS } from '@/lib/age';
import { compareSeverity, type DeadlineSeverity } from './severity';

/** `paused`: ESI's Paused without a reinforcement timer, so not known to be reinforced. */
export type DenState = 'running' | 'reinforced' | 'paused' | 'disabled' | 'unknown';

export interface DenOperation {
  state: 'available' | 'started' | 'done';
  /** Always sent by ESI; null only when the instant would not parse. */
  expiresMs: number | null;
}

export interface Den {
  id: number;
  state: DenState;
  reinforcedUntilMs: number | null;
  /** 0–4; null when ESI sent Unspecified or the detail could not be read. */
  anarchyLevel: number | null;
  operations: readonly DenOperation[];
}

export function denState(
  raw: 'Running' | 'Paused' | 'Disabled' | 'Unspecified',
  hasTimer: boolean
): DenState {
  if (raw === 'Paused') return hasTimer ? 'reinforced' : 'paused';
  if (raw === 'Running') return 'running';
  if (raw === 'Disabled') return 'disabled';
  return 'unknown';
}

/** Completed, Expired, Removed and Unspecified all read `done`. */
export function operationState(raw: string): DenOperation['state'] {
  if (raw === 'Available') return 'available';
  if (raw === 'Started') return 'started';
  return 'done';
}

export function levelNumber(level: string): number | null {
  const match = /^Level([0-4])$/.exec(level);
  return match ? Number(match[1]) : null;
}

/** Anarchy level at which a den starts taking workforce from its skyhook. */
export const ANARCHY_SIPHON_LEVEL = 2;

/** An open operation expiring sooner than this warns. */
export const OPERATION_SOON_MS = DAY_MS;

/**
 * Reinforced with its timer still ahead. A timer already past comes from a
 * stale read: the den is likely out, so it reads as paused, not critical.
 */
export function isReinforced(den: Den, nowMs: number): boolean {
  return (
    den.state === 'reinforced' && den.reinforcedUntilMs !== null && den.reinforcedUntilMs > nowMs
  );
}

/** What the den shows as now: a lapsed reinforcement is `paused`. */
export function denStateAt(den: Den, nowMs: number): DenState {
  return den.state === 'reinforced' && !isReinforced(den, nowMs) ? 'paused' : den.state;
}

type TimedOperation = DenOperation & { expiresMs: number };

/** Available or started, not yet expired, soonest first. */
export function openOperations(
  operations: readonly DenOperation[],
  nowMs: number
): TimedOperation[] {
  return operations
    .filter(
      (op): op is TimedOperation =>
        op.state !== 'done' && op.expiresMs !== null && op.expiresMs > nowMs
    )
    .sort((a, b) => a.expiresMs - b.expiresMs);
}

/** Open operations a pilot can start: Available only, soonest first. */
export function readyOperations(den: Den, nowMs: number): TimedOperation[] {
  return openOperations(den.operations, nowMs).filter((op) => op.state === 'available');
}

/** Reinforced is critical; anything that needs a visit soon warns; a field ESI left blank is watch, never clear. */
export function denSeverity(den: Den, nowMs: number): DeadlineSeverity {
  if (isReinforced(den, nowMs)) return 'critical';
  const state = denStateAt(den, nowMs);
  const soonOperation = openOperations(den.operations, nowMs).some(
    (op) => op.expiresMs - nowMs < OPERATION_SOON_MS
  );
  if (
    state === 'disabled' ||
    state === 'paused' ||
    (den.anarchyLevel ?? 0) >= ANARCHY_SIPHON_LEVEL ||
    soonOperation
  ) {
    return 'warning';
  }
  if (state === 'unknown' || den.anarchyLevel === null) return 'watch';
  return 'clear';
}

/** The den's soonest clock: reinforcement end while reinforced, else its soonest open operation. */
function nextClockMs(den: Den, nowMs: number): number {
  if (isReinforced(den, nowMs)) return den.reinforcedUntilMs!;
  return openOperations(den.operations, nowMs)[0]?.expiresMs ?? Infinity;
}

export function sortDens<T extends Den>(dens: readonly T[], nowMs: number): T[] {
  const keyed = dens.map((den) => ({
    den,
    severity: denSeverity(den, nowMs),
    clock: nextClockMs(den, nowMs),
  }));
  return keyed
    .sort(
      (a, b) =>
        compareSeverity(a.severity, b.severity) ||
        (a.clock === b.clock ? 0 : a.clock - b.clock) ||
        a.den.id - b.den.id
    )
    .map(({ den }) => den);
}

export type DenHeadline =
  | { kind: 'reinforced' | 'operations'; count: number; nextId: number; remainingMs: number }
  | { kind: 'dens'; count: number };

/** Reinforced dens first, then ready operations, then the plain den count. */
export function denHeadline(dens: readonly Den[], nowMs: number): DenHeadline {
  const reinforced = dens.filter((den) => isReinforced(den, nowMs));
  if (reinforced.length > 0) {
    const next = reinforced.reduce((a, b) => (b.reinforcedUntilMs! < a.reinforcedUntilMs! ? b : a));
    return {
      kind: 'reinforced',
      count: reinforced.length,
      nextId: next.id,
      remainingMs: next.reinforcedUntilMs! - nowMs,
    };
  }
  const ready = dens.flatMap((den) =>
    readyOperations(den, nowMs).map((op) => ({ id: den.id, expiresMs: op.expiresMs }))
  );
  if (ready.length > 0) {
    const next = ready.reduce((a, b) => (b.expiresMs < a.expiresMs ? b : a));
    return {
      kind: 'operations',
      count: ready.length,
      nextId: next.id,
      remainingMs: next.expiresMs - nowMs,
    };
  }
  return { kind: 'dens', count: dens.length };
}
