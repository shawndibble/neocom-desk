/**
 * The pure decisions inside `useFittingWorkspace`'s Fitting Share Code session —
 * extracted so they're unit-testable without mounting the hook. Everything
 * async (the decode itself, its cancellation, the encode sequence number,
 * the save mutex) stays in the hook: it's ordering plumbing a sync function
 * can't own, not a decision. Types only — no router, no db, no engine
 * runtime import.
 */
import type { Fitting } from '@/engine/fittings/types';

export interface OwnWrite {
  code: string;
  /** Set by `edit()` only; a Load's own write carries `fitting: null`. */
  fitting: Fitting | null;
}

export interface PendingOpen {
  code: string;
  name: string;
}

export interface ShareCodeChangeInput {
  /** What this hook itself last wrote to `?f=`, or null if nothing's pending. */
  ownWrite: OwnWrite | null;
  /** A saved Fitting being opened, naming what the decode should call it. */
  pendingOpen: PendingOpen | null;
  /** The URL's current `f` param. */
  shareCode: string | null;
}

export interface ShareCodeChangeDecision {
  /**
   * False only when this hook's own write produced the current `shareCode`
   * — an edit, or a Load whose write already landed. True for a pasted
   * link, Back/Forward, or first mount: `lastLoad`, `tooLargeToShare`, the
   * coalescing run and any pending drone launch all reset on this flag.
   */
  isDifferentFitting: boolean;
  /** False when opening a saved Fitting by code — `savedId` should survive. */
  resetSavedId: boolean;
  /**
   * The edited Fitting to show immediately, skipping the async decode —
   * set only when `ownWrite` carries one AND its code matches `shareCode`.
   * Null means: decode `shareCode` instead.
   */
  adopted: Fitting | null;
}

export function resolveShareCodeChange({
  ownWrite,
  pendingOpen,
  shareCode,
}: ShareCodeChangeInput): ShareCodeChangeDecision {
  const isDifferentFitting = ownWrite?.code !== shareCode;
  const resetSavedId = isDifferentFitting && pendingOpen?.code !== shareCode;
  const adopted = ownWrite?.code === shareCode ? ownWrite.fitting : null;
  return { isDifferentFitting, resetSavedId, adopted };
}

export interface CoalesceRun {
  key: string;
  at: number;
}

export interface CoalesceDecision {
  /** Replace the current history entry instead of pushing a new one. */
  coalesce: boolean;
  /** The run to remember for the next edit; null ends coalescing. */
  next: CoalesceRun | null;
}

/**
 * Whether an edit's URL write should coalesce into the last one — the same
 * `coalesceKey` (one control, e.g. a drone-count stepper) seen again inside
 * `windowMs`. Judged against the last edit that actually wrote the URL, not
 * the last one asked for, so a superseded first edit of a run never starts
 * the window.
 */
export function resolveCoalesce(
  last: CoalesceRun | null,
  coalesceKey: string | undefined,
  now: number,
  windowMs: number
): CoalesceDecision {
  const coalesce =
    coalesceKey !== undefined &&
    last !== null &&
    last.key === coalesceKey &&
    now - last.at < windowMs;
  const next = coalesceKey === undefined ? null : { key: coalesceKey, at: now };
  return { coalesce, next };
}
