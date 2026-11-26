import {
  createSemaphore,
  type Priority,
  type PriorityTicket,
  type Release,
} from '@/lib/concurrency';
import { EsiBudgetError, type ThrottleStatus, type BudgetRefusal } from './errors';
import { MINUTE_MS } from '@/lib/age';

export const ESI_MAX_IN_FLIGHT = 12;

export const ESI_FOREGROUND_RESERVE = 4;

export const ERROR_LIMIT_LOW_WATER = 30;

export const MAX_REQUEST_SPACING_MS = 2000;

export const MAX_BUDGET_WAIT_MS = 5000;

export const DEFAULT_ERROR_WINDOW_MS = MINUTE_MS;

const DEFAULT_RATE_WINDOW_MS = 1000;

export const MAX_CIRCUIT_MS = 5 * MINUTE_MS;

export type { ThrottleStatus, BudgetRefusal } from './errors';
export { EsiBudgetError } from './errors';

export interface BudgetState {
  readonly errorRemain: number | null;
  readonly errorResetAt: number | null;
  readonly rateRemain: number | null;
  readonly rateResetAt: number | null;
  readonly circuitUntil: number | null;
  readonly circuitStatus: ThrottleStatus | null;
  readonly circuitShutAt: number | null;
  readonly nextAdmissionAt: number;
}

export const INITIAL_BUDGET: BudgetState = {
  errorRemain: null,
  errorResetAt: null,
  rateRemain: null,
  rateResetAt: null,
  circuitUntil: null,
  circuitStatus: null,
  circuitShutAt: null,
  nextAdmissionAt: 0,
};

export interface ObservedResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly now: number;
  readonly startedAt?: number;
}

function numericHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function resetInstant(seconds: number | null, now: number): number | null {
  if (seconds === null) return null;
  return now + Math.min(seconds * 1000, MAX_CIRCUIT_MS);
}

export function observeBudget(state: BudgetState, response: ObservedResponse): BudgetState {
  const { status, headers, now } = response;

  const errorRemain = numericHeader(headers, 'x-esi-error-limit-remain');
  const errorResetAt = resetInstant(numericHeader(headers, 'x-esi-error-limit-reset'), now);
  const rateRemain = numericHeader(headers, 'x-ratelimit-remaining');
  const rateResetAt = resetInstant(numericHeader(headers, 'x-ratelimit-reset'), now);

  let next: BudgetState = {
    ...state,
    errorRemain: errorRemain ?? state.errorRemain,
    errorResetAt: errorResetAt ?? state.errorResetAt,
    rateRemain: rateRemain ?? state.rateRemain,
    rateResetAt: rateResetAt ?? state.rateResetAt,
  };

  if (status === 420) {
    next = {
      ...next,
      circuitUntil: errorResetAt ?? now + DEFAULT_ERROR_WINDOW_MS,
      circuitStatus: 420,
      circuitShutAt: now,
    };
  } else if (status === 429) {
    const retryAfter = resetInstant(numericHeader(headers, 'retry-after'), now);
    next = {
      ...next,
      circuitUntil: retryAfter ?? rateResetAt ?? now + DEFAULT_RATE_WINDOW_MS,
      circuitStatus: 429,
      circuitShutAt: now,
    };
  } else if (status < 400 && startedAfterTheShut(next, response)) {
    next = { ...next, circuitUntil: null, circuitStatus: null, circuitShutAt: null };
  }

  return next;
}

function startedAfterTheShut(state: BudgetState, response: ObservedResponse): boolean {
  if (state.circuitShutAt === null) return true;
  return (response.startedAt ?? response.now) >= state.circuitShutAt;
}

export type RequestPlan =
  | { readonly kind: 'go'; readonly waitMs: number }
  | { readonly kind: 'refuse'; readonly reason: BudgetRefusal; readonly retryAfterMs: number };

function brakeMs(remain: number | null, resetAt: number | null, now: number): number {
  if (remain === null || resetAt === null || resetAt <= now) return 0;
  if (remain > ERROR_LIMIT_LOW_WATER) return 0;
  return Math.min((resetAt - now) / Math.max(remain, 1), MAX_REQUEST_SPACING_MS);
}

function spacingMs(state: BudgetState, now: number): number {
  return Math.max(
    brakeMs(state.errorRemain, state.errorResetAt, now),
    brakeMs(state.rateRemain, state.rateResetAt, now)
  );
}

const CLOCK_JUMP_HORIZON_MS = MAX_CIRCUIT_MS + MAX_BUDGET_WAIT_MS + MAX_REQUEST_SPACING_MS;

function believable(instant: number, now: number): number {
  return instant - now > CLOCK_JUMP_HORIZON_MS ? now : instant;
}

function refusalReason(state: BudgetState, shutUntil: number): BudgetRefusal {
  if (shutUntil === 0 || state.circuitStatus === null) return 'pacing';
  return state.circuitStatus === 429 ? 'rateLimit' : 'errorLimit';
}

export function planRequest(
  state: BudgetState,
  now: number
): { readonly plan: RequestPlan; readonly state: BudgetState } {
  const shutUntil =
    state.circuitUntil !== null && state.circuitUntil > now
      ? believable(state.circuitUntil, now)
      : 0;
  const earliest = Math.max(now, shutUntil, believable(state.nextAdmissionAt, now));
  const waitMs = earliest - now;

  if (waitMs > MAX_BUDGET_WAIT_MS) {
    return {
      plan: {
        kind: 'refuse',
        reason: refusalReason(state, shutUntil),
        retryAfterMs: waitMs,
      },
      state,
    };
  }

  const spacing = spacingMs(state, now);
  return {
    plan: { kind: 'go', waitMs },
    state: spacing > 0 ? { ...state, nextAdmissionAt: earliest + spacing } : state,
  };
}

let budget: BudgetState = INITIAL_BUDGET;
let semaphore = createSemaphore(ESI_MAX_IN_FLIGHT, { lowReserve: ESI_FOREGROUND_RESERVE });

export function observeEsiResponse(status: number, headers: Headers, startedAt?: number): void {
  budget = observeBudget(budget, { status, headers, now: Date.now(), startedAt });
}

export function esiBudgetSnapshot(): BudgetState {
  return budget;
}

export function esiInFlight(): number {
  return semaphore.inFlight;
}

export function resetEsiBudget(): void {
  budget = INITIAL_BUDGET;
  semaphore = createSemaphore(ESI_MAX_IN_FLIGHT, { lowReserve: ESI_FOREGROUND_RESERVE });
}

function aborted(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(aborted(signal));
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(aborted(signal));
      },
      { once: true }
    );
  });
}

export async function passEsiGate(signal?: AbortSignal, lane?: PriorityTicket): Promise<Release> {
  const { plan, state } = planRequest(budget, Date.now());
  budget = state;
  if (plan.kind === 'refuse') throw new EsiBudgetError(plan.reason, plan.retryAfterMs);
  await sleep(plan.waitMs, signal);
  return semaphore.acquire(signal, lane);
}

export function promoteEsiLane(lane: PriorityTicket, to: Priority): void {
  semaphore.promote(lane, to);
}
